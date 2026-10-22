/** 主区域中国象棋面板与其 Host/Agent 落子桥。 */
import type { PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots';
import type { SessionId } from '@deepseek-ai/dsh-client-connection/client';
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
import type { XiangqiAiTurnRequest, XiangqiAiTurnResult, XiangqiDecisionTrace, XiangqiNewGameRequest, XiangqiRuntimeState, XiangqiSerializedState } from '../types.ts';
import { createXiangqiStore } from './store.ts';
export interface XiangqiClientRemote {
    newGame: (sessionId: SessionId, request: XiangqiNewGameRequest) => Promise<RemoteResult<XiangqiSerializedState>>;
    get: (sessionId: SessionId, gameId?: string) => Promise<RemoteResult<XiangqiSerializedState>>;
    getRuntimeState: (sessionId: SessionId) => Promise<RemoteResult<XiangqiRuntimeState>>;
    getDecisionTrace: (sessionId: SessionId, gameId?: string) => Promise<RemoteResult<XiangqiDecisionTrace | null>>;
    move: (sessionId: SessionId, request: {
        gameId: string;
        revision: number;
        move: {
            from: string;
            to: string;
        };
    }) => Promise<RemoteResult<XiangqiSerializedState>>;
    undo: (sessionId: SessionId, request: {
        gameId: string;
        revision: number;
    }) => Promise<RemoteResult<XiangqiSerializedState>>;
    resign: (sessionId: SessionId, request: {
        gameId: string;
        revision: number;
        side: 'red' | 'black';
    }) => Promise<RemoteResult<XiangqiSerializedState>>;
    requestAiMove: (sessionId: SessionId, request: XiangqiAiTurnRequest) => Promise<RemoteResult<XiangqiAiTurnResult>>;
    cancelAiMove: (sessionId: SessionId) => Promise<RemoteResult<{
        readonly cancelled: boolean;
    }>>;
}
export type XiangqiPanelProps = PropsRuntime<'main'> & PropsStore<ReturnType<typeof createXiangqiStore>>;
/**
 * Build the `main` panel component with the mounted Remote face closed over the
 * plugin fiber. This avoids a module-level singleton and keeps HMR unload-safe.
 * @param remote - mounted Xiangqi Remote namespace.
 * @param onExit - leaves the panel for the Conversation (the page's own exit affordance).
 */
export declare function createXiangqiPanel(remote: XiangqiClientRemote, onExit: () => void): ({ useSessions, useStore, actions, }: XiangqiPanelProps) => import("react").JSX.Element;
//# sourceMappingURL=XiangqiPanel.d.ts.map