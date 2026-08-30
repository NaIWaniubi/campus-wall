/**
 * WS 实时连接状态：连接中/已连/重连中 + 最近事件时间
 * 供界面展示连接状态、调试实时链路是否工作
 */
import { defineStore } from 'pinia'

export const useRealtimeStore = defineStore('realtime', {
  state: () => ({
    connected: false,
    /** 最近一次收到服务端帧的时间戳（0 = 从未） */
    lastEventAt: 0,
    /** 当前重连尝试次数（0 = 已连接或未开始） */
    reconnectAttempt: 0,
  }),
  actions: {
    setConnected(v: boolean) {
      this.connected = v
      if (v) {
        this.lastEventAt = Date.now()
        this.reconnectAttempt = 0
      }
    },
    setAttempt(n: number) {
      this.reconnectAttempt = n
    },
    touch() {
      this.lastEventAt = Date.now()
    },
  },
})
