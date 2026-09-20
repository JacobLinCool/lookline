import type { ImageryMessages } from '../en/imagery'

export const imagery: ImageryMessages = {
  photoField: '你的照片',
  newPhoto: '新照片',
  rememberPhoto: '記住這張照片',
  useSavedPhoto: '使用已存的照片',
  canvas: {
    imageStyle: '圖片風格',
    render: '生成',
    rendering: '生成中…',
    renderingStatus: '正在生成圖片',
    ready: '圖片完成',
    imageUnavailable: '圖片暫時無法顯示。',
    renderFailed: '無法開始生成。',
    cancelFailed: '無法取消生成。',
    checkFailed: '無法確認生成進度，重新載入即可繼續。',
    imageLoadFailed: '新的圖片無法載入，目前顯示的仍是上一張。',
  },
  flash: {
    added: '已加入購物袋。',
    regenerated: '圖片已更新。',
    visibility: '已更新可見範圍。',
  },
  line: {
    size: (size: string) => `尺寸 ${size}`,
    oneSize: '單一尺寸',
  },
  recipient: {
    legend: '購買對象',
    self: '自己',
    other: '別人',
    undisclosed: '暫不填',
    label: '要給誰',
    hint: '填個名字就好，只有你看得到。',
    placeholder: '媽媽 · 小美 · 朋友',
  },
}
