declare module 'virtual:seasons-config' {
  /** 由 build/seasons-config.ts 從 api/seasons.config.json 產生，只供退路模式使用（D-04）。 */
  const seasons: ReadonlyArray<{
    readonly id: string;
    readonly startDate: string;
    readonly countInclusive: boolean;
  }>;
  export default seasons;
}

interface ImportMetaEnv {
  /** API 位址（SRS §7、§8.5）；本機寫在 web/.env.local，正式建置由 Actions Variables 提供 */
  readonly VITE_API_BASE?: string;
  /** 網站完整網址（D-13，階段 7 使用） */
  readonly VITE_SITE_URL?: string;
}
