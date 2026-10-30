declare module 'virtual:seasons-config' {
  /** 由 build/seasons-config.ts 從 api/seasons.config.json 產生，只供退路模式使用（D-04）。 */
  const seasons: ReadonlyArray<{
    readonly id: string;
    readonly startDate: string;
    readonly countInclusive: boolean;
  }>;
  export default seasons;
}
