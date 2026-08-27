/**
 * WS 模块导出
 */
export { attachWebSocket } from './server.js';
export { sendTo, sendToConv, broadcastTopic, subscribeConv, stats } from './hub.js';
export type { Conn } from './hub.js';
export type { TClientMsg, TServerMsg } from './protocol.js';
