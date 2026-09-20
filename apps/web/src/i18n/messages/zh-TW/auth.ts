import type { AuthMessages } from '../en/auth'

export const auth: AuthMessages = {
  title: '選擇身分',
  metaTitle: '選擇身分',
  continueAs: (name: string) => `以 ${name} 繼續`,
  guest: '以訪客身分繼續',
  guestNote: '訪客身分會把購物袋留在這台裝置上。',
  signInToContinue: '請先登入。',
  signedInAs: (name: string) => `已登入為 ${name}`,

  nameLabel: '你的名字',
  noProfiles: '還沒有身分。',
  noProfilesNote: '請在下方輸入名字後繼續。',
  profilesUnavailable: '目前無法取得身分列表。',
  errors: {
    missing: '請選擇一個身分再繼續。',
    unknown: '這個身分已不存在，請換一個。',
    guest: '登入沒有成功，請輸入名字後再試一次。',
  } as Record<string, string>,
}
