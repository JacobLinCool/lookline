import type { TrendsMessages } from '../en/trends'

export const trends: TrendsMessages = {
  title: '趨勢',
  forMakalot: '聚陽專用',
  exportCsv: '匯出 CSV',

  window: {
    range: (from: string, to: string, updated: string) => `${from} – ${to} · ${updated} 更新`,
    lastDays: (days: number) => `近 ${days} 天`,
  },

  unavailable: {
    title: '目前無法取得趨勢資料。',
    body: '請啟動資料庫後重新載入。',
  },

  headline: {
    looks: '新建 Look',
    remixes: '改作次數',
    asks: '提問次數',
    togethers: '共創版本',
    shares: '分享次數',
    purchasesFromLooks: '由 Look 帶來的購買',
    purchasesFromLooksHint: (purchases: string, share: string) =>
      `${purchases} 筆購買中的 ${share}`,
    gmvFromLooks: '由 Look 帶來的 GMV',
    gmvFromLooksHint: '歸因於某個 Look',
    activePeople: '活躍人數',
    crossClusterRemixes: '跨群改作',
    crossClusterRemixesHint: '改作中跨越品味分群的比例',
    lineageDepth: '平均傳承深度',
    lineageDepthHint: '從源頭到最深的 Look',
  },

  sections: {
    momentum: '風格動能',
    emerging: '正在興起',
    byDimension: '各維度動能',
    categories: '品類',
    colours: '顏色',
    silhouettes: '輪廓',
    heat: '風格 × 品類',
    propagation: '擴散',
    propagationNote: '傳得最遠的 Look。',
    seeds: 'Look 傳得最遠的人',
    clusters: '品味分群',
    manufacturing: '開款 / 備料',
  },

  metric: {
    momentum: '動能',
    volume: '量能',
    velocity: '增速',
    crossCluster: '跨群擴散',
    conversion: '轉換率',
    gmv: 'GMV',
  },

  dimension: {
    aesthetic: '風格',
    category: '品類',
    color: '顏色',
    silhouette: '輪廓',
    detail: '設計細節',
    motif: '印花主題',
    aesthetic_category: '風格 × 品類',
  },

  status: {
    emerging: '新興',
    rising: '上升',
    fading: '衰退',
    stable: '持平',
  },

  table: {
    name: '名稱',
    aesthetic: '風格',
    status: '狀態',
    empty: '這段期間沒有訊號。',
  },

  chart: {
    emerging: '新興',
    weightedEvents: (events: number) => `${events} 次加權事件`,
  },

  emerging: {
    empty: '這段期間沒有新興趨勢。',
  },

  heat: {
    aesthetic: '風格',
    cell: (pair: string, momentum: number, volume: number, emerging: boolean) =>
      `${pair}：動能 ${momentum}、量能 ${volume}${emerging ? '、新興' : ''}`,
    noSignal: (pair: string) => `${pair}：無訊號`,
    legend: '顏色越深＝動能越強 · * 新興',
    empty: '這段期間沒有風格 × 品類訊號。',
  },

  propagation: {
    rootOf: (looks: string) => `${looks} 的源頭`,
    people: '人數',
    clusters: '分群',
    purchases: '購買',
    seeTree: '查看樹狀圖',
    empty: '目前沒有超過一個 Look 的傳承。',
  },

  seeds: {
    person: '人',
    cluster: '分群',
    remixesCaused: '帶動改作',
    downstreamPurchases: '下游購買',
    downstreamGmv: '下游 GMV',
    clustersReached: '觸及分群',
    empty: '還沒有 Look 被改作或購買。',
  },

  clusters: {
    meta: (id: number, people: string, share: string | null) =>
      `分群 ${id} · ${people}${share ? ` · ${share}` : ''}`,
    unlabelled: '未命名',
    empty: '目前沒有品味分群。',
  },

  manufacturing: {
    rank: '#',
    group: '組合',
    signal: '訊號',
    confidence: '信心度',
    projectedDemand: '預估需求',
    demandUnit: '需求筆數 / 28 天',
    rationale: '依據',
    evidence: '證據',
    noEvidence: '沒有紀錄任何證據。',
    empty: '目前沒有開款或備料建議。',
    signals: {
      develop: '開款',
      stock: '備料',
      watch: '觀察',
    } as Record<string, string>,
    evidenceFields: {
      score: '分數',
      demand14d: '14 天需求量',
      demandIntents14d: '14 天需求筆數',
      supply: '供給品項',
      lowStockShare: '低庫存比例',
      searchGap: '搜尋落差',
      velocity: '增速',
      conversion: '轉換率',
      crossCluster: '跨群擴散',
      clusters: '擴散分群數',
      remixes14d: '14 天改作數',
      purchases14d: '14 天購買數',
      daysConsistent: '連續天數',
      dominantSilhouette: '主要輪廓',
      topRootLooks: '主要源頭 Look',
      sampleIntents: '需求語句範例',
      topProducts: '主要商品',
      clusterLabels: '分群標籤',
    } as Record<string, string>,
  },

  lineage: {
    kind: {
      edition: 'Look',
      remix: '改作',
      together: '共創',
    },
    thisLook: '這個 Look',
    velocityValue: (looksPerDay: string) => `${looksPerDay} 個 Look / 天`,
    stats: {
      depth: '深度',
      nodes: '樹中的 Look 數',
      people: '觸及人數',
      clusters: '觸及品味分群',
      shares: '分享',
      asks: '提問',
      remixes: '改作',
      purchases: '購買',
      gmv: '下游 GMV',
      velocity: '增速',
      shareToRemix: '分享 → 改作',
      remixToPurchase: '改作 → 購買',
      firstLook: '第一個 Look',
      latestLook: '最新的 Look',
    },
  },
}
