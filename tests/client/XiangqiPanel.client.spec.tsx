// @vitest-environment jsdom

import { useMemo, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { createXiangqiPanel, type XiangqiClientRemote } from '../../src/client/XiangqiPanel.tsx'
import { newGame as createGame } from '../../src/game/rules.ts'
import { serialize } from '../../src/game/serialization.ts'
import type { XiangqiUiState } from '../../src/client/store.ts'

afterEach(cleanup)

function initialState(): XiangqiUiState {
  return {
    sessionId: null,
    gameId: null,
    revision: null,
    game: null,
    decisionTrace: null,
    operationBusy: false,
    aiPending: false,
    activity: 'idle',
    error: null,
  }
}

function Harness({
  Panel,
  currentSession = 'session-1',
  initialSessionId = null,
  onDetachSession,
}: {
  Panel: ReturnType<typeof createXiangqiPanel>
  currentSession?: string
  initialSessionId?: string | null
  onDetachSession?: () => void
}) {
  const [state, setState] = useState(() => ({ ...initialState(), sessionId: initialSessionId }))
  const actions = useMemo(() => {
    const update = (patch: Partial<XiangqiUiState>) => {
      setState(previous => ({ ...previous, ...patch }))
    }
    return {
      attachSession: (sessionId: string) => update({ sessionId }),
      detachSession: () => {
        onDetachSession?.()
        update({ sessionId: null, operationBusy: false, activity: 'idle', error: null })
      },
      clearGame: () => update({ sessionId: null, gameId: null, revision: null, game: null, operationBusy: false, aiPending: false, activity: 'idle', error: null }),
      hostReset: () => update({ gameId: null, revision: null, game: null, decisionTrace: null, aiPending: false }),
      setOperationBusy: (busy: boolean) => update({ operationBusy: busy }),
      setAiPending: (pending: boolean) => update({ aiPending: pending }),
      setActivity: (activity: XiangqiUiState['activity']) => update({ activity }),
      setError: (error: string | null) => update({ error }),
      setDecisionTrace: (decisionTrace: XiangqiUiState['decisionTrace']) => update({ decisionTrace }),
      setGame: () => undefined,
    }
  }, [])

  const useStore = <T,>(select: (value: XiangqiUiState) => T): T => select(state)
  // 0.2.x 适配：SessionListState 不再带 current，主视图会话由 mainView 引用计数表达。
  const sessionSnapshot = {
    ids: [currentSession],
    byId: { [currentSession]: { id: currentSession, retainedBy: { mainView: 1 } } },
    phase: 'ready',
    projectionsBySession: {},
  }
  const useSessions = <T,>(select: (value: typeof sessionSnapshot) => T): T => select(sessionSnapshot)

  return (
    <Panel
      useStore={useStore as never}
      useSessions={useSessions as never}
      actions={actions as never}
    />
  )
}

/** 运行状态轮询的空实现：不返回任何棋局，避免测试受轮询节奏影响。 */
function runtimePollingStub() {
  return vi.fn().mockRejectedValue(new Error('runtime state not mocked'))
}

describe('XiangqiPanel', () => {
  it('does not create a new game when global synchronization fails', async () => {
    const remote = {
      get: vi.fn().mockRejectedValue(new Error('internal: xiangqi: game "game-stale" was not found')),
      newGame: vi.fn(),
      getRuntimeState: runtimePollingStub(),
    } as unknown as XiangqiClientRemote
    const Panel = createXiangqiPanel(remote, vi.fn())

    render(<Harness Panel={Panel} />)

    await waitFor(() => expect(remote.get).toHaveBeenCalledTimes(1))
    await new Promise(resolve => setTimeout(resolve, 30))

    expect(remote.newGame).not.toHaveBeenCalled()
    expect(screen.getByText('internal: xiangqi: game "game-stale" was not found')).toBeTruthy()
  })

  it('reads the Host global game directly when the panel mounts', async () => {
    const remote = {
      get: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          gameId: 'game-2',
          revision: 1,
          phase: 'active',
          gameState: JSON.parse(serialize(createGame())),
        },
      }),
      newGame: vi.fn(),
      getRuntimeState: runtimePollingStub(),
    } as unknown as XiangqiClientRemote
    const Panel = createXiangqiPanel(remote, vi.fn())

    render(<Harness Panel={Panel} />)

    await waitFor(() => expect(remote.get).toHaveBeenCalledWith('session-1', undefined))
    expect(remote.newGame).not.toHaveBeenCalled()
  })

  it('keeps the panel and does not cancel AI when switching chats', async () => {
    const remote = {
      get: vi.fn(),
      newGame: vi.fn(),
      cancelAiMove: vi.fn().mockResolvedValue({ ok: true, value: { cancelled: true } }),
      getRuntimeState: runtimePollingStub(),
    } as unknown as XiangqiClientRemote
    const Panel = createXiangqiPanel(remote, vi.fn())
    const onDetachSession = vi.fn()

    const view = render(<Harness
      Panel={Panel}
      currentSession="session-1"
      initialSessionId="session-1"
      onDetachSession={onDetachSession}
    />)
    expect(screen.getByText('正在准备棋局……')).toBeTruthy()

    view.rerender(<Harness
      Panel={Panel}
      currentSession="session-2"
      initialSessionId="session-1"
    />)

    await waitFor(() => expect(screen.getByText('正在准备棋局……')).toBeTruthy())
    expect(remote.cancelAiMove).not.toHaveBeenCalled()
    expect(onDetachSession).not.toHaveBeenCalled()
  })

  it('asks for a session instead of rendering a board without one', () => {
    const remote = {
      get: vi.fn(),
      newGame: vi.fn(),
      getRuntimeState: runtimePollingStub(),
    } as unknown as XiangqiClientRemote
    const Panel = createXiangqiPanel(remote, vi.fn())

    function NoSession() {
      const useStore = <T,>(select: (value: XiangqiUiState) => T): T => select(initialState())
      const sessionSnapshot = { ids: [], byId: {}, phase: 'empty-with-ready', projectionsBySession: {} }
      const useSessions = <T,>(select: (value: typeof sessionSnapshot) => T): T => select(sessionSnapshot)
      return <Panel useStore={useStore as never} useSessions={useSessions as never} actions={{} as never} />
    }

    render(<NoSession />)

    expect(screen.getByText('请先在左侧选择或创建一个会话。')).toBeTruthy()
    expect(remote.get).not.toHaveBeenCalled()
  })
})
