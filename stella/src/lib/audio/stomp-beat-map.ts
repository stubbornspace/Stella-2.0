export interface BeatMap {
  file: string
  duration: number
  sampleRate: number
  analysis: {
    detectedBpm: number
    halfTimeBpm: number
    confidence: string
    method: string
    tempoStability: string
  }
  beats: number[]
  downbeats: number[]
  beatCount: number
  downbeatCount: number
  meanInterBeatInterval: number
}

export const stompBeatMap: BeatMap = {
  file: "stomp.mp3",
  duration: 23.133,
  sampleRate: 44100,
  analysis: {
    detectedBpm: 166.71,
    halfTimeBpm: 83.35,
    confidence: "high",
    method: "librosa.beat.beat_track (4 independent methods converged)",
    tempoStability: "constant (no tempo changes detected)",
  },
  beats: [
    0.3715, 0.7314, 1.1029, 1.4629, 1.8228, 2.1711, 2.5426, 2.9025,
    3.2624, 3.6223, 3.9822, 4.3421, 4.702, 5.062, 5.4335, 5.7934, 6.1533,
    6.5132, 6.8847, 7.2446, 7.6045, 7.9644, 8.3244, 8.6843, 9.0442, 9.4041,
    9.7756, 10.1355, 10.4954, 10.8553, 11.2152, 11.5751, 11.9351, 12.295,
    12.6665, 13.0264, 13.3863, 13.7462, 14.1061, 14.4776, 14.8259, 15.1859,
    15.5458, 15.9173, 16.2772, 16.6371, 16.997, 17.3569, 17.7168, 18.0767,
    18.4483, 18.8082, 19.1681, 19.528, 19.8879, 20.2478, 20.6193, 20.9676,
    21.3391, 21.699, 22.059, 22.4189, 22.7788,
  ],
  downbeats: [
    0.3715, 1.1029, 1.8228, 2.5426, 3.2624, 3.9822, 4.702, 5.4335, 6.1533,
    6.8847, 7.6045, 8.3244, 9.0442, 9.7756, 10.4954, 11.2152, 11.9351,
    12.6665, 13.3863, 14.1061, 14.8259, 15.5458, 16.2772, 16.997, 17.7168,
    18.4483, 19.1681, 19.8879, 20.6193, 21.3391, 22.059, 22.7788,
  ],
  beatCount: 63,
  downbeatCount: 32,
  meanInterBeatInterval: 0.3614,
}

export const STOMP_DOWNBEAT_BPM = stompBeatMap.analysis.halfTimeBpm
