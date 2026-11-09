# AI 使用紀錄草稿：<task-notification>

> AI 依對話紀錄自動起草。**請本人檢查每一列**，特別是「人工判斷與修正」與「採用程度」；確認後把「狀態」改成「已確認」。
> 「軟工活動」只能填：需求、設計、程式、測試、除錯、審查、文件、管理；「採用程度」只能填：直接採用、小幅修改、大幅修改、僅參考、不採用。不需要的列整段刪掉。

## 1

- 日期：2026-11-08
- 成員：黃予岑
- 軟工活動：設計
- 具體工作：撰寫 Epic 5（FEFO 領用，Story 5.1-5.3）合併規格 spec-5-1-5-3-fefo-issue.md，並決定開發分支與 PR 拆分方式
- AI 工具／BMad 技能：Claude Code＋bmad-build
- Prompt 重點：執行 /bmad-build，請 AI 調查現有 schema 與前後端慣例後，為 Epic 5 的三個 story 產出一份實作規格
- AI 產出摘要：spec-5-1-5-3-fefo-issue.md（API、策略模式設計、I/O 矩陣），並重建 feat/fefo-issue 分支
- 人工判斷與修正：使用者選擇『重建 feat/fefo-issue 分支』而非開新分支；選擇『三個 story 合併成一份 spec、一個 PR』；spec 字數超過建議上限仍核准繼續
- 採用程度：直接採用
- 截圖／檔案：docs/ai-evidence/20261108-mintguesss-35da92f7/turn-01.png、docs/ai-evidence/20261108-mintguesss-35da92f7/transcript.md
- 對應文件章節：C（架構設計）
- 狀態：待確認

## 2

- 日期：2026-11-08
- 成員：黃予岑
- 軟工活動：程式
- 具體工作：實作後端 issue 模組：FefoStrategy／ManualStrategy、repository、service、schemas、router
- AI 工具／BMad 技能：Claude Code＋bmad-build
- Prompt 重點：依 spec 實作領用建議與確認扣庫存的後端邏輯
- AI 產出摘要：app/modules/issue/ 下 strategies、repository(_sqlalchemy)、errors、service、schemas、dependencies、router 等檔案
- 人工判斷與修正：（待本人補充）
- 採用程度：直接採用
- 截圖／檔案：docs/ai-evidence/20261108-mintguesss-35da92f7/turn-01.png、docs/ai-evidence/20261108-mintguesss-35da92f7/transcript.md
- 對應文件章節：D（物件設計）
- 狀態：待確認

## 3

- 日期：2026-11-08
- 成員：黃予岑
- 軟工活動：測試
- 具體工作：撰寫後端 FEFO/Manual 策略與 service 的單元測試，以及領用併發鎖定的整合測試
- AI 工具／BMad 技能：Claude Code＋bmad-build
- Prompt 重點：依 spec Verification 章節補齊後端測試覆蓋率
- AI 產出摘要：test_fefo_strategy.py、test_manual_strategy.py、test_issue_service.py、test_issues.py（412 個後端測試通過）
- 人工判斷與修正：（待本人補充）
- 採用程度：直接採用
- 截圖／檔案：docs/ai-evidence/20261108-mintguesss-35da92f7/turn-01.png、docs/ai-evidence/20261108-mintguesss-35da92f7/transcript.md
- 對應文件章節：F（測試報告）
- 狀態：待確認

## 4

- 日期：2026-11-08
- 成員：黃予岑
- 軟工活動：程式
- 具體工作：將「開發中」的領用頁換成正式前端頁面（api、hooks、IssuesPage）
- AI 工具／BMad 技能：Claude Code＋bmad-build
- Prompt 重點：依現有樣式與元件慣例（如 StorageLocationsPage）實作領用頁
- AI 產出摘要：features/issue/api.ts、hooks.ts、pages/IssuesPage.tsx
- 人工判斷與修正：（待本人補充）
- 採用程度：直接採用
- 截圖／檔案：docs/ai-evidence/20261108-mintguesss-35da92f7/turn-01.png、docs/ai-evidence/20261108-mintguesss-35da92f7/transcript.md
- 對應文件章節：D（物件設計）
- 狀態：待確認

## 5

- 日期：2026-11-08
- 成員：黃予岑
- 軟工活動：測試
- 具體工作：撰寫領用頁前端測試
- AI 工具／BMad 技能：Claude Code＋bmad-build
- Prompt 重點：為 IssuesPage 補上元件測試
- AI 產出摘要：IssuesPage.test.tsx（185 個前端測試通過，含 lint/typecheck/build）
- 人工判斷與修正：（待本人補充）
- 採用程度：直接採用
- 截圖／檔案：docs/ai-evidence/20261108-mintguesss-35da92f7/turn-01.png、docs/ai-evidence/20261108-mintguesss-35da92f7/transcript.md
- 對應文件章節：F（測試報告）
- 狀態：待確認

## 6

- 日期：2026-11-08
- 成員：黃予岑
- 軟工活動：審查
- 具體工作：同時派出三個審查 subagent（Blind Hunter／Edge Case Hunter／Verification Gap）審查領用功能的完整 diff
- AI 工具／BMad 技能：Claude Code＋bmad-build（subagent 審查）
- Prompt 重點：依 step-04-review 流程，對照 spec 與 diff 做盲點、邊界情境與驗證缺口三方審查
- AI 產出摘要：三份審查報告，合計約 24～30 項發現
- 人工判斷與修正：（待本人補充，對話中未見使用者親自逐項判斷審查內容，僅見等待與後續彙整）
- 採用程度：僅參考
- 截圖／檔案：docs/ai-evidence/20261108-mintguesss-35da92f7/turn-01.png、docs/ai-evidence/20261108-mintguesss-35da92f7/turn-02.png、docs/ai-evidence/20261108-mintguesss-35da92f7/turn-03.png、docs/ai-evidence/20261108-mintguesss-35da92f7/transcript.md
- 對應文件章節：D（物件設計）
- 狀態：待確認

## 7

- 日期：2026-11-08
- 成員：黃予岑
- 軟工活動：除錯
- 具體工作：核實三方審查結果並修正前端 4 個實際錯誤（重複取得建議表格清空、未取消的舊請求、隱藏原因仍送出、錯誤未逐列清除），補齊測試缺口
- AI 工具／BMad 技能：Claude Code＋bmad-build
- Prompt 重點：逐項核實 24 項審查發現，修正真正的 bug、駁回其餘項目並記錄理由
- AI 產出摘要：IssuesPage.tsx 修正、新增後端/前端測試、Review Triage Log 記錄於 spec
- 人工判斷與修正：（待本人補充）
- 採用程度：直接採用
- 截圖／檔案：docs/ai-evidence/20261108-mintguesss-35da92f7/turn-03.png、docs/ai-evidence/20261108-mintguesss-35da92f7/transcript.md
- 對應文件章節：D（物件設計）
- 狀態：待確認

## 8

- 日期：2026-11-08
- 成員：黃予岑
- 軟工活動：文件
- 具體工作：執行 bmad-walkthrough，產生 FEFO 領用功能的程式碼導覽說明
- AI 工具／BMad 技能：Claude Code＋bmad-walkthrough
- Prompt 重點：對已完成的 issue 功能產生定位說明與導覽路徑
- AI 產出摘要：問題/方案摘要、變更統計（25 檔案、~1,200 行邏輯）、程式碼位置清單
- 人工判斷與修正：（待本人補充）
- 採用程度：直接採用
- 截圖／檔案：docs/ai-evidence/20261108-mintguesss-35da92f7/turn-04.png、docs/ai-evidence/20261108-mintguesss-35da92f7/transcript.md
- 對應文件章節：C（軟體設計）
- 狀態：待確認

## 9

- 日期：2026-11-08
- 成員：黃予岑
- 軟工活動：測試
- 具體工作：啟動開發用後端（8000）與前端（5173），確認示範資料與帳號可用，提供手動測試流程
- AI 工具／BMad 技能：Claude Code
- Prompt 重點：開啟系統讓使用者實機測試領用功能
- AI 產出摘要：後端/前端啟動成功、提供 6 步驟測試建議與資料復原方式說明
- 人工判斷與修正：（待本人補充）
- 採用程度：直接採用
- 截圖／檔案：docs/ai-evidence/20261108-mintguesss-35da92f7/turn-05.png、docs/ai-evidence/20261108-mintguesss-35da92f7/transcript.md
- 對應文件章節：F（測試報告）
- 狀態：待確認

## 10

- 日期：2026-11-08
- 成員：黃予岑
- 軟工活動：需求
- 具體工作：澄清使用者對領用紀錄、單位處理、食材選單分類三項的新需求
- AI 工具／BMad 技能：Claude Code
- Prompt 重點：使用者實測後提出：領用紀錄要不要做、單位是否不合理（如雞胸肉/白米）、食材選單要加分類
- AI 產出摘要：三組選項式提問（最近紀錄做法／維持 SRS A2 單位假設／分類篩選＋分組選單）
- 人工判斷與修正：使用者對三項提問皆選擇 AI 建議選項：領用頁加最近紀錄、維持 A2 改善提示與示範資料、分類篩選＋分組選單
- 採用程度：直接採用
- 截圖／檔案：docs/ai-evidence/20261108-mintguesss-35da92f7/turn-06.png、docs/ai-evidence/20261108-mintguesss-35da92f7/transcript.md
- 對應文件章節：B（需求分析）
- 狀態：待確認

## 11

- 日期：2026-11-08
- 成員：黃予岑
- 軟工活動：程式
- 具體工作：後端新增食材分類/效期狀態/低庫存欄位，並將最近領用紀錄依操作分組
- AI 工具／BMad 技能：Claude Code
- Prompt 重點：依使用者決定修改 repository/service，回傳分類與狀態資訊、分組最近紀錄
- AI 產出摘要：repository.py、service.py 修改，GET /issues/ingredients 回傳更多欄位
- 人工判斷與修正：（待本人補充）
- 採用程度：直接採用
- 截圖／檔案：docs/ai-evidence/20261108-mintguesss-35da92f7/turn-06.png、docs/ai-evidence/20261108-mintguesss-35da92f7/transcript.md
- 對應文件章節：D（物件設計）
- 狀態：待確認

## 12

- 日期：2026-11-08
- 成員：黃予岑
- 軟工活動：測試
- 具體工作：補充後端整合測試：食材選項帶分類/狀態/低庫存、最近領用紀錄分組與排序
- AI 工具／BMad 技能：Claude Code
- Prompt 重點：為新增的後端行為補測試覆蓋
- AI 產出摘要：test_issues.py 新增測試（25 個整合測試通過）
- 人工判斷與修正：（待本人補充）
- 採用程度：直接採用
- 截圖／檔案：docs/ai-evidence/20261108-mintguesss-35da92f7/turn-06.png、docs/ai-evidence/20261108-mintguesss-35da92f7/transcript.md
- 對應文件章節：F（測試報告）
- 狀態：待確認

## 13

- 日期：2026-11-08
- 成員：黃予岑
- 軟工活動：程式
- 具體工作：前端實作分類篩選＋分組下拉的 IngredientPicker 與 RecentIssues 元件並串接頁面
- AI 工具／BMad 技能：Claude Code
- Prompt 重點：依使用者決定改善食材選單與新增最近領用紀錄顯示
- AI 產出摘要：features/issue/components/IngredientPicker.tsx、RecentIssues.tsx 及 IssuesPage.tsx 串接
- 人工判斷與修正：（待本人補充）
- 採用程度：直接採用
- 截圖／檔案：docs/ai-evidence/20261108-mintguesss-35da92f7/turn-06.png、docs/ai-evidence/20261108-mintguesss-35da92f7/transcript.md
- 對應文件章節：D（物件設計）
- 狀態：待確認

## 14

- 日期：2026-11-08
- 成員：黃予岑
- 軟工活動：測試
- 具體工作：更新前端測試以配合新的食材選項格式與最近紀錄顯示
- AI 工具／BMad 技能：Claude Code
- Prompt 重點：修正因元件改版而失敗的測試並補新情境
- AI 產出摘要：IssuesPage.test.tsx 更新（194 個前端測試通過）
- 人工判斷與修正：（待本人補充）
- 採用程度：直接採用
- 截圖／檔案：docs/ai-evidence/20261108-mintguesss-35da92f7/turn-06.png、docs/ai-evidence/20261108-mintguesss-35da92f7/transcript.md
- 對應文件章節：F（測試報告）
- 狀態：待確認

## 15

- 日期：2026-11-08
- 成員：黃予岑
- 軟工活動：除錯
- 具體工作：排查 /api/v1/issues 回 404 的原因，確認為後端熱重載未套用新 router，重啟服務解決
- AI 工具／BMad 技能：Claude Code
- Prompt 重點：（AI 自主排查，非使用者提問）
- AI 產出摘要：確認 port 8000 的舊程式未重載，重啟 uvicorn 解決
- 人工判斷與修正：（待本人補充）
- 採用程度：直接採用
- 截圖／檔案：docs/ai-evidence/20261108-mintguesss-35da92f7/turn-06.png、docs/ai-evidence/20261108-mintguesss-35da92f7/transcript.md
- 對應文件章節：D（物件設計）
- 狀態：待確認

## 16

- 日期：2026-11-08
- 成員：黃予岑
- 軟工活動：需求
- 具體工作：澄清單位小數顯示/對齊、非FEFO測試方式、異動紀錄更正機制（沖銷）等需求
- AI 工具／BMad 技能：Claude Code
- Prompt 重點：使用者回饋單位小數易看錯、找不到非FEFO測試方式、紀錄填錯無法修改刪除
- AI 產出摘要：說明 AD-5 異動只能新增、提出沖銷機制與整數單位限制兩組選項式提問
- 人工判斷與修正：使用者決定『現在做沖銷領用』；整數單位限制選擇『只改顯示不擋輸入』，未採用 AI 推薦的『後端共用規則擋小數』
- 採用程度：小幅修改
- 截圖／檔案：docs/ai-evidence/20261108-mintguesss-35da92f7/turn-07.png、docs/ai-evidence/20261108-mintguesss-35da92f7/transcript.md
- 對應文件章節：B（需求分析）
- 狀態：待確認

## 17

- 日期：2026-11-08
- 成員：黃予岑
- 軟工活動：程式
- 具體工作：後端實作整數單位提示規則 units.py 與領用沖銷（reversal）邏輯
- AI 工具／BMad 技能：Claude Code
- Prompt 重點：依使用者決定實作沖銷與整數單位提示
- AI 產出摘要：app/domain/units.py 新增、service.py/router.py 整合沖銷功能
- 人工判斷與修正：（待本人補充）
- 採用程度：直接採用
- 截圖／檔案：docs/ai-evidence/20261108-mintguesss-35da92f7/turn-07.png、docs/ai-evidence/20261108-mintguesss-35da92f7/transcript.md
- 對應文件章節：D（物件設計）
- 狀態：待確認

## 18

- 日期：2026-11-08
- 成員：黃予岑
- 軟工活動：測試
- 具體工作：補充沖銷與整數單位限制的後端單元/整合測試
- AI 工具／BMad 技能：Claude Code
- Prompt 重點：為新增的沖銷與單位規則補測試覆蓋
- AI 產出摘要：test_issue_service.py、test_issues.py 新增測試（445 個後端測試通過）
- 人工判斷與修正：（待本人補充）
- 採用程度：直接採用
- 截圖／檔案：docs/ai-evidence/20261108-mintguesss-35da92f7/turn-07.png、docs/ai-evidence/20261108-mintguesss-35da92f7/transcript.md
- 對應文件章節：F（測試報告）
- 狀態：待確認

## 19

- 日期：2026-11-08
- 成員：黃予岑
- 軟工活動：程式
- 具體工作：前端實作 Quantity 數量顯示元件（淡化多餘小數）與沖銷操作 UI
- AI 工具／BMad 技能：Claude Code
- Prompt 重點：改善小數顯示易誤看問題，並提供沖銷按鈕/確認流程
- AI 產出摘要：shared/ui/Quantity.tsx 新增，IngredientPicker/RecentIssues/IssuesPage 套用並串接沖銷 API
- 人工判斷與修正：（待本人補充）
- 採用程度：直接採用
- 截圖／檔案：docs/ai-evidence/20261108-mintguesss-35da92f7/turn-07.png、docs/ai-evidence/20261108-mintguesss-35da92f7/transcript.md
- 對應文件章節：D（物件設計）
- 狀態：待確認

## 20

- 日期：2026-11-08
- 成員：黃予岑
- 軟工活動：除錯
- 具體工作：修正前端測試在 jsdom 環境下因 Textarea autosize 失敗的問題，並排查/重啟後端沖銷路由 405 問題
- AI 工具／BMad 技能：Claude Code
- Prompt 重點：（AI 自主排查測試失敗與服務異常原因）
- AI 產出摘要：Textarea 改固定行數、調整測試查詢節點；重啟 uvicorn 解決熱重載未生效
- 人工判斷與修正：（待本人補充）
- 採用程度：直接採用
- 截圖／檔案：docs/ai-evidence/20261108-mintguesss-35da92f7/turn-07.png、docs/ai-evidence/20261108-mintguesss-35da92f7/transcript.md
- 對應文件章節：D（物件設計）
- 狀態：待確認

## 21

- 日期：2026-11-08
- 成員：黃予岑
- 軟工活動：程式
- 具體工作：新增多批次示範食材資料，並參考儲存位置頁為領用頁加上進場/互動動畫
- AI 工具／BMad 技能：Claude Code
- Prompt 重點：使用者要求補可測非FEFO情境的示範資料，並為可點擊元件與進頁加動畫
- AI 產出摘要：cli.py seed 資料調整（5 項食材雙批次）、issue.module.css、motion.ts 及頁面套用，重灌開發資料庫
- 人工判斷與修正：使用者同意重灌開發資料庫（seed-demo --reset）套用新示範資料
- 採用程度：直接採用
- 截圖／檔案：docs/ai-evidence/20261108-mintguesss-35da92f7/turn-08.png、docs/ai-evidence/20261108-mintguesss-35da92f7/transcript.md
- 對應文件章節：D（物件設計）
- 狀態：待確認

## 22

- 日期：2026-11-08
- 成員：黃予岑
- 軟工活動：除錯
- 具體工作：修正食材選單切換分類時會自動關閉的問題，經三輪嘗試，最終以 Playwright 實機測試找出為 Chip radio 焦點轉移所致並徹底解決，同時修正輸入框對齊高度
- AI 工具／BMad 技能：Claude Code
- Prompt 重點：使用者多次回報『選單還是會關閉』，要求修正且與需要數量欄位對齊
- AI 產出摘要：第一次改用 Mantine Combobox 自組（未解決）；第二次將分類移進清單內（仍未解決）；第三次改分類按鈕為一般 button 並用 Playwright 驗證根因、修正對齊高度
- 人工判斷與修正：使用者兩次回報『還是不行／沒做到』，否決前兩次修正方案，直到第三次才確認解決
- 採用程度：大幅修改
- 截圖／檔案：docs/ai-evidence/20261108-mintguesss-35da92f7/turn-08.png、docs/ai-evidence/20261108-mintguesss-35da92f7/turn-09.png、docs/ai-evidence/20261108-mintguesss-35da92f7/turn-10.png、docs/ai-evidence/20261108-mintguesss-35da92f7/transcript.md
- 對應文件章節：D（物件設計）
- 狀態：待確認

## 23

- 日期：2026-11-08
- 成員：黃予岑
- 軟工活動：程式
- 具體工作：調整示範資料單位：白米改為「袋」、鮭魚片改為「包」並重灌開發資料庫
- AI 工具／BMad 技能：Claude Code
- Prompt 重點：使用者要求白米按實際進貨/領用習慣改用「袋」而非維持公斤
- AI 產出摘要：cli.py 示範資料調整（白米約20公斤/袋、鮭魚片約1公斤/包），重灌資料庫
- 人工判斷與修正：使用者否決 AI 原先建議（白米維持公斤），要求改用「袋」計量
- 採用程度：小幅修改
- 截圖／檔案：docs/ai-evidence/20261108-mintguesss-35da92f7/turn-09.png、docs/ai-evidence/20261108-mintguesss-35da92f7/transcript.md
- 對應文件章節：D（物件設計）
- 狀態：待確認

## 24

- 日期：2026-11-08
- 成員：黃予岑
- 軟工活動：管理
- 具體工作：執行 /ship 流程：跑完整後端/前端檢查後，準備產生 AI 使用紀錄、commit、push 並開 PR
- AI 工具／BMad 技能：Claude Code＋ship skill
- Prompt 重點：執行 /ship，請 AI 依流程完成上線前檢查與送出 PR
- AI 產出摘要：確認後端446個/前端208個測試、lint、build 全部通過，依 ship 腳本準備 PR 說明文字
- 人工判斷與修正：（待本人補充，對話於 ship 腳本執行中中斷，未見最終結果）
- 採用程度：直接採用
- 截圖／檔案：docs/ai-evidence/20261108-mintguesss-35da92f7/turn-11.png、docs/ai-evidence/20261108-mintguesss-35da92f7/transcript.md
- 對應文件章節：A（專案管理）
- 狀態：待確認
