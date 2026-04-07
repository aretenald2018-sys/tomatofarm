// ================================================================
// finance/index.js — 오케스트레이터
// ================================================================

import { renderFinance, toggleFlowChart } from './core.js';
import { refreshFinMarketData, renderStockList, renderPortfolioSummary, setMarketDeps } from './market.js';
import { renderPositionTables } from './positions.js';
import { renderNetWorthCards } from './assets.js';
import { openStockDetail, closeStockDetailModal, switchStockDetailTab, changeStockChartRange, toggleLiveAutoRefresh, changeLiveRange } from './stock-detail.js';
import { openSwingBuy, editSwingPosition, closeSwingPosition, setSwingDeps } from './swing.js';
import { openPbBuy, editPbPosition, closePbPosition, setPullbackDeps } from './pullback.js';
import { runFinAIAnalysis } from './ai.js';
import {
  setModalDeps,
  openFinBenchmarkModal, closeFinBenchmarkModal, saveFinBenchmarkFromModal,
  deleteFinBenchmarkFromModal, deleteFinBenchmarkDirect,
  openFinActualModal, closeFinActualModal, saveFinActualFromModal, deleteFinActualFromModal,
  openFinPlanModal, closeFinPlanModal, saveFinPlanFromModal,
  deleteFinPlanFromModal, deleteFinPlanDirect, addFinPlanEntry,
  openFinLoanModal, closeFinLoanModal, saveFinLoanFromModal, deleteFinLoanFromModal,
  openFinPositionModal, closeFinPositionModal, saveFinPositionFromModal, deleteFinPositionFromModal,
} from './modals.js';
import {
  onBudgetYearChange, onBudgetQChange,
  openBudgetGroupModal, deleteBudgetGroup,
  openBudgetItemModal, closeBudgetItemModal, saveBudgetItemFromModal,
  deleteBudgetItemFromModal, deleteBudgetItem,
  editBudgetMonth, editBudgetQGoal,
} from './budget.js';

// ── 순환 참조 해결: 콜백 주입 ──
setModalDeps({ renderFinance });
setMarketDeps({ renderPositionTables, renderNetWorthCards });
setSwingDeps({ renderStockList, renderPortfolioSummary });
setPullbackDeps({ renderStockList, renderPortfolioSummary });

// ── Export ──
export {
  renderFinance,
  toggleFlowChart,
  refreshFinMarketData,
  runFinAIAnalysis,
  // 종목 상세
  openStockDetail, closeStockDetailModal, switchStockDetailTab,
  changeStockChartRange, toggleLiveAutoRefresh, changeLiveRange,
  // 스윙/풀백 포지션
  openSwingBuy, editSwingPosition, closeSwingPosition,
  openPbBuy, editPbPosition, closePbPosition,
  // 벤치마크 모달
  openFinBenchmarkModal, closeFinBenchmarkModal, saveFinBenchmarkFromModal,
  deleteFinBenchmarkFromModal, deleteFinBenchmarkDirect,
  // 연간실적 모달
  openFinActualModal, closeFinActualModal, saveFinActualFromModal, deleteFinActualFromModal,
  // 계획실적 모달
  openFinPlanModal, closeFinPlanModal, saveFinPlanFromModal,
  deleteFinPlanFromModal, deleteFinPlanDirect, addFinPlanEntry,
  // 대출 모달
  openFinLoanModal, closeFinLoanModal, saveFinLoanFromModal, deleteFinLoanFromModal,
  // 포지션 모달
  openFinPositionModal, closeFinPositionModal, saveFinPositionFromModal, deleteFinPositionFromModal,
  // 가계부
  onBudgetYearChange, onBudgetQChange,
  openBudgetGroupModal, deleteBudgetGroup,
  openBudgetItemModal, closeBudgetItemModal, saveBudgetItemFromModal,
  deleteBudgetItemFromModal, deleteBudgetItem,
  editBudgetMonth, editBudgetQGoal,
};
