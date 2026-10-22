/** Browser half: the sidebar panel row, its main-panel page, and the generated DSH Remote bridge. */
import xiangqiRemote from '@deepseek-ai/dsh-plugin-xiangqi/remote';
import { createXiangqiPanel, } from "./XiangqiPanel.js";
import { XiangqiPanelIcon } from "./XiangqiPanelIcon.js";
import { createXiangqiStore } from "./store.js";
export { XiangqiBoard, XiangqiPage } from "./XiangqiPage.js";
export { liveStatusTextOf, toXiangqiGameViewModel, turnOf, ucciOf } from "./view-model.js";
export { createXiangqiStore } from "./store.js";
export { createXiangqiPanel } from "./XiangqiPanel.js";
export { XiangqiPanelIcon } from "./XiangqiPanelIcon.js";
export { XIANGQI_COLUMNS, XIANGQI_ROWS, } from "./types.js";
/**
 * The outer Client plugin mounts the generated Remote; the UI itself runs in
 * a child fiber.
 */
export const name = 'dsh-plugin-xiangqi/client';
export const inject = ['remote'];
/** Mount the Host Remote, then activate the UI in a child with the exact namespace injection. */
export async function apply(ctx) {
    let disposeRemote;
    try {
        disposeRemote = await ctx.remote.$mount(xiangqiRemote);
    }
    catch (error) {
        if (disposeRemote !== undefined)
            await disposeRemote();
        throw error;
    }
    // A mounted Remote namespace is a Cordis child service. Reading
    // ctx.remote.xiangqi from this outer fiber would violate the injection guard,
    // while declaring it in the outer `inject` would deadlock before $mount runs.
    // Park the UI in a child fiber that starts only after the namespace exists.
    await ctx.inject(['slots', 'sessions', 'remote', 'remote.xiangqi', 'layout'], (uiCtx) => {
        applyXiangqiUi(uiCtx);
    });
    return async () => {
        if (disposeRemote !== undefined)
            await disposeRemote();
    };
}
/** Panel id shared by the sidebar row and the main-slot occupant. */
const PANEL_ID = 'xiangqi';
/** Register the browser surfaces from a context authorized for remote.xiangqi. */
function applyXiangqiUi(ctx) {
    const store = createXiangqiStore();
    // remote.xiangqi is a dynamically mounted child Service. A strict get is
    // stable across Loader-owned child fibers; chained property access is not.
    const remote = ctx.get('remote.xiangqi');
    if (remote === undefined)
        throw new Error('象棋 Remote 挂载后仍不可用');
    // 棋盘页是主区域面板：宿主面板列表按 order 升序渲染，负值把它排在
    // 「插件」(0) 与「自动化任务」(10) 之上。
    const Panel = createXiangqiPanel(remote, () => { ctx.layout.selectPanel(null); });
    ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main',
        key: PANEL_ID,
        store,
    }, Panel));
    ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: -10,
        label: '下盘象棋',
        store,
    }, XiangqiPanelIcon));
}
//# sourceMappingURL=index.js.map