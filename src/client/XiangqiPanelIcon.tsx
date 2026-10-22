/** 侧栏「下盘象棋」行的装饰图标：象棋棋子轮廓 + 象字。 */

import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'

export function XiangqiPanelIcon({ size }: PropsRuntime<'sidebar.panellist'>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9.25" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="12" cy="12" r="6.75" stroke="currentColor" strokeWidth="0.9" opacity="0.5" />
      <text
        x="12"
        y="15.6"
        textAnchor="middle"
        fontSize="8.4"
        fontWeight="600"
        fill="currentColor"
      >象</text>
    </svg>
  )
}
