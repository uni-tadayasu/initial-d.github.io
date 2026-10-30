"""頭文字Dブラウザゲーム: 2人用 WebSocket 中継サーバー。

Production deployment: run behind an HTTPS/WSS reverse proxy. This server provides
room discovery, WebRTC signaling and low-rate fallback race packets. It does NOT
provide full authoritative game physics or cheat prevention.

Setup: python -m pip install 'websockets>=14,<18'
Usage: python room_server.py --host 127.0.0.1 --port 47817
LAN:   python room_server.py --host 0.0.0.0 --port 47817
"""
import argparse
import asyncio
import json
import logging
import re
import time
from collections import defaultdict, deque

from websockets.asyncio.server import serve
from websockets.exceptions import ConnectionClosed

LOG = logging.getLogger('tns-room')
ROOM_ID = re.compile(r'^tns-race-[A-Z2-9]{8}$')
MAX_ROOMS_PER_CLIENT = 4
MAX_PUBLISH_PER_SEC = 35
MAX_MSG_BYTES = 48 * 1024

class Broker:
    def __init__(self):
        self.topics = defaultdict(set)
        self.subs = defaultdict(set)
        self.rates = defaultdict(deque)

    async def unregister(self, ws):
        for topic in self.subs.pop(ws, set()):
            clients = self.topics.get(topic)
            if clients:
                clients.discard(ws)
                if not clients:
                    self.topics.pop(topic, None)
        self.rates.pop(ws, None)

    async def handler(self, ws):
        peer = getattr(ws, 'remote_address', 'unknown')
        LOG.info('connected %s', peer)
        try:
            async for raw in ws:
                if not isinstance(raw, str) or len(raw.encode('utf8')) > MAX_MSG_BYTES:
                    continue
                try:
                    msg = json.loads(raw)
                except (ValueError, TypeError):
                    continue
                if not isinstance(msg, dict):
                    continue
                typ = msg.get('type')
                if typ == 'ping':
                    await ws.send(json.dumps({'type':'pong'}))
                elif typ == 'subscribe':
                    rooms = msg.get('topics', [])
                    if not isinstance(rooms, list):
                        continue
                    for topic in rooms[:MAX_ROOMS_PER_CLIENT]:
                        if isinstance(topic, str) and ROOM_ID.fullmatch(topic):
                            if len(self.subs[ws]) < MAX_ROOMS_PER_CLIENT:
                                self.subs[ws].add(topic)
                                self.topics[topic].add(ws)
                elif typ == 'unsubscribe':
                    rooms = msg.get('topics', [])
                    if isinstance(rooms, list):
                        for topic in rooms:
                            self.subs[ws].discard(topic)
                            clients=self.topics.get(topic)
                            if clients:
                                clients.discard(ws)
                                if not clients:self.topics.pop(topic, None)
                elif typ == 'publish':
                    topic = msg.get('topic')
                    payload = msg.get('data')
                    if not isinstance(topic, str) or topic not in self.subs[ws]:
                        continue
                    if not isinstance(payload, dict) or payload.get('app') != 'tns-room-v10':
                        continue
                    queue = self.rates[ws]; now=time.monotonic()
                    while queue and now-queue[0]>1:
                        queue.popleft()
                    if len(queue) >= MAX_PUBLISH_PER_SEC:
                        continue
                    queue.append(now)
                    peers = tuple(self.topics.get(topic, ()))
                    if peers:
                        packet=json.dumps({'type':'publish','topic':topic,'data':payload},ensure_ascii=False,separators=(',',':'))
                        await asyncio.gather(*(self.safe_send(other,packet) for other in peers if other is not ws))
        except ConnectionClosed:
            pass
        finally:
            await self.unregister(ws)
            LOG.info('disconnected %s',peer)

    @staticmethod
    async def safe_send(ws, payload):
        try: await ws.send(payload)
        except ConnectionClosed: pass

async def main():
    parser=argparse.ArgumentParser(description='頭文字Dブラウザゲーム 部屋コード中継サーバー')
    parser.add_argument('--host',default='127.0.0.1')
    parser.add_argument('--port',type=int,default=47817)
    args=parser.parse_args()
    logging.basicConfig(level=logging.INFO,format='%(asctime)s %(levelname)s %(message)s')
    broker=Broker()
    async with serve(broker.handler,args.host,args.port,max_size=MAX_MSG_BYTES,ping_interval=20,ping_timeout=20,compression=None):
        LOG.info('Room relay listening ws://%s:%s',args.host,args.port)
        LOG.warning('For Internet multiplayer: deploy behind HTTPS/WSS. Do NOT expose ws:// unencrypted to the Internet.')
        await asyncio.Future()

if __name__ == '__main__':
    try:asyncio.run(main())
    except KeyboardInterrupt:pass
