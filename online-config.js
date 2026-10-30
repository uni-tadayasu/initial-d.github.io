// GitHub Pages用の8人オンライン接続設定。
// 空欄でも、ホストがゲーム内の「通信サーバーURL」へ一度WSS URLを貼れば使えます。
// 招待リンクには中継URLが自動で入るので、友達は設定不要です。
// 固定ドメインを使う場合のみ relayUrl を埋めてください。
window.TNS8_CONFIG = {
  relayUrl: "", // 例: "wss://your-game.example.com/ws"
  roomCapacity: 8
};
