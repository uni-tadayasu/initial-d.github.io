"""尾文字Z V23 - minimal stateless 2-person room-code relay.
This server only forwards transient race signaling/state. It never receives or
stores GitHub credentials, accounts, saved games, coins or personal information.
Requires: python 3.11+ and websockets 13+.
"""
from __future__ import annotations
import asyncio
import json
import os
import re
import time
from http import HTTPStatus
from collections import defaultdict
from websockets.asyncio.server import serve

HOST = os.getenv('OMOZ_LISTEN_HOST', '127.0.0.1')
PORT = int(os.getenv('OMOZ_PORT', '18765'))
TOPIC_RE = re.compile(r'^tns-race-[A-Z2-9]{8}$')
MAX_CLIENTS = 64
MAX_ROOM_MEMBERS = 8
MAX_MESSAGES_PER_SECOND = 45
MAX_MESSAGE_BYTES = 32768
CLIENTS = set()
TOPICS: dict[str, set] = defaultdict(set)

async def reply(client, obj):
    try:
        await client.send(json.dumps(obj, ensure_ascii=False, separators=(',', ':')))
    except Exception:
        pass

async def process_request(connection, request):
    # Cloudflare Tunnel probes root with HTTP; do not serve files or auth data.
    if request.headers.get('Upgrade', '').lower() != 'websocket':
        return connection.respond(HTTPStatus.OK, 'OmojiZ room relay is online.\n')
    return None

async def handle(ws):
    if len(CLIENTS) >= MAX_CLIENTS:
        await ws.close(code=1013, reason='server full')
        return
    CLIENTS.add(ws)
    mine = set()
    tick = time.monotonic()
    count = 0
    try:
        async for raw in ws:
            if not isinstance(raw, str) or len(raw.encode('utf-8')) > MAX_MESSAGE_BYTES:
                await ws.close(code=1009, reason='message too large')
                break
            now = time.monotonic()
            if now-tick >= 1.0:
                tick = now
                count = 0
            count += 1
            if count > MAX_MESSAGES_PER_SECOND:
                await ws.close(code=1008, reason='message rate exceeded')
                break
            try:
                data = json.loads(raw)
            except (ValueError, TypeError):
                continue
            if not isinstance(data, dict):
                continue
            typ = data.get('type')
            if typ == 'ping':
                await reply(ws, {'type':'pong'})
            elif typ == 'subscribe':
                topics = data.get('topics', [])
                if not isinstance(topics, list):
                    continue
                for topic in topics[:3]:
                    if not isinstance(topic,str) or not TOPIC_RE.fullmatch(topic):
                        await reply(ws,{'type':'error','message':'invalid topic'})
                        continue
                    if topic not in mine and len(TOPICS[topic]) >= MAX_ROOM_MEMBERS:
                        await reply(ws,{'type':'error','code':'room_full','message':'this room is full'})
                        continue
                    TOPICS[topic].add(ws)
                    mine.add(topic)
            elif typ == 'unsubscribe':
                topics = data.get('topics', [])
                if not isinstance(topics, list):
                    continue
                for topic in topics[:3]:
                    if topic in mine:
                        mine.discard(topic)
                        TOPICS[topic].discard(ws)
                        if not TOPICS[topic]:
                            del TOPICS[topic]
            elif typ == 'publish':
                topic = data.get('topic')
                payload = data.get('data')
                if topic not in mine or not isinstance(payload,dict) or payload.get('app')!='tns-room-v10':
                    continue
                # Broadcast within the ephemeral room, excluding sender.
                msg = json.dumps({'type':'publish','topic':topic,'data':payload},ensure_ascii=False,separators=(',',':'))
                peers = list(TOPICS.get(topic, set()) - {ws})
                if peers:
                    await asyncio.gather(*(peer.send(msg) for peer in peers),return_exceptions=True)
    finally:
        CLIENTS.discard(ws)
        for topic in mine:
            TOPICS[topic].discard(ws)
            if not TOPICS[topic]:
                del TOPICS[topic]

async def main():
    print(f'[OMOGIZ] WebSocket room relay: ws://{HOST}:{PORT}',flush=True)
    print('[OMOGIZ] Save data / GitHub tokens are never stored here.',flush=True)
    async with serve(handle, HOST, PORT, process_request=process_request,
                     max_size=MAX_MESSAGE_BYTES, max_queue=32, ping_interval=20,
                     ping_timeout=20, compression=None):
        await asyncio.Future()

if __name__=='__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
