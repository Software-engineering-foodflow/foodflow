# AI 使用紀錄草稿：FoodFlow B 圖表排版、正確性核對與泳道圖生成

> AI 依對話紀錄自動起草。**請本人檢查每一列**，特別是「人工判斷與修正」與「採用程度」；確認後把「狀態」改成「已確認」。
> 「軟工活動」只能填：需求、設計、程式、測試、除錯、審查、文件、管理；「採用程度」只能填：直接採用、小幅修改、大幅修改、僅參考、不採用。不需要的列整段刪掉。

## 1

- 日期：2026-11-09
- 成員：ChiaJungTien
- 軟工活動：文件
- 具體工作：比較並否決模組分區與局部圖的 report-v2 方案。
- AI 工具／BMad 技能：Codex／bmad-agent-architect
- Prompt 重點：要求改善 ER 與類別圖的交錯線條、保留全部內容及原版，之後限定只調整 B 文件。
- AI 產出摘要：產生模組分區總圖與局部圖供比較；使用者不採用後刪除 report-v2，共 35 個檔案，原圖保留。
- 人工判斷與修正：使用者明確表示較喜歡原版，要求不採用新版並刪除 report-v2；並要求保留原始圖與其他組員內容。
- 採用程度：不採用
- 截圖／檔案：docs/ai-evidence/20261109-chiajungtien-b-diagrams-swimlanes-01a1ac49/turn-03.png、docs/ai-evidence/20261109-chiajungtien-b-diagrams-swimlanes-01a1ac49/transcript.md
- 對應文件章節：B（圖表排版方案比較）
- 狀態：待確認

## 2

- 日期：2026-11-09
- 成員：ChiaJungTien
- 軟工活動：設計
- 具體工作：建立橫向完整類別圖與 ER 圖，核對內容後升為正式版。
- AI 工具／BMad 技能：Codex／bmad-agent-architect
- Prompt 重點：依參考圖改成緊湊橫向布局，以直角線連接，保留 12 張表、93 欄及全部 Cardinality；替換前先核對。
- AI 產出摘要：完成兩張完整橫向圖；以唯讀方式核對 PostgreSQL 0001、ORM、migration、B 文件與 SRS，12 表、93 欄、20 關聯一致；類別圖含 93 個持久化屬性及 receipt_number 衍生屬性。使用者確認後備份舊版並更新 b-class-diagram、b-er-diagram 的 PUML／PNG／SVG。
- 人工判斷與修正：使用者要求先檢查進貨明細與批次、異動與報廢、自我沖銷及位置關聯；之後明確選用微調前的 horizontal-candidate 並回覆「確認」才覆蓋原始檔。
- 採用程度：直接採用
- 截圖／檔案：docs/ai-evidence/20261109-chiajungtien-b-diagrams-swimlanes-01a1ac49/turn-06.png、docs/ai-evidence/20261109-chiajungtien-b-diagrams-swimlanes-01a1ac49/turn-09.png、docs/ai-evidence/20261109-chiajungtien-b-diagrams-swimlanes-01a1ac49/transcript.md
- 對應文件章節：B（ER 圖與領域類別圖）
- 狀態：待確認

## 3

- 日期：2026-11-09
- 成員：ChiaJungTien
- 軟工活動：設計
- 具體工作：評估標籤避讓微調版本，最後保留前一版作正式基礎。
- AI 工具／BMad 技能：Codex
- Prompt 重點：調整 operator、from/to location、底部 batch 與沖銷自我關聯，避免關聯線穿過標籤。
- AI 產出摘要：產生 final-preview，以 PlantUML 加 SVG 標籤微調腳本輸出；幾何檢查無線穿字與標籤重疊，但不等於純 PlantUML 直接匯出的版面。此版本後來依使用者指示刪除。
- 人工判斷與修正：使用者選擇使用前一個 horizontal-candidate 版本，未採用這份微調輸出，並另外要求刪除 final-preview。
- 採用程度：不採用
- 截圖／檔案：docs/ai-evidence/20261109-chiajungtien-b-diagrams-swimlanes-01a1ac49/turn-08.png、docs/ai-evidence/20261109-chiajungtien-b-diagrams-swimlanes-01a1ac49/transcript.md
- 對應文件章節：B（圖表可讀性比較）
- 狀態：待確認

## 4

- 日期：2026-11-09
- 成員：ChiaJungTien
- 軟工活動：文件
- 具體工作：清理中間圖檔並統一正式圖表標題。
- AI 工具／BMad 技能：Codex
- Prompt 重點：刪除 final-preview、兩組候選版 PNG／PUML／SVG，保留正式版與原版備份；移除標題的「橫向版」。
- AI 產出摘要：刪除 final-preview 的 8 個檔案及 6 個候選檔；正式圖標題更新為「食序 FoodFlow｜領域類別圖」與「食序 FoodFlow｜完整 ER 圖」，重新產生 PNG／SVG。
- 人工判斷與修正：使用者分別指定可刪除的資料夾與候選檔案，並明確要求去掉「橫向版」標題；正式圖與原版備份保留。
- 採用程度：直接採用
- 截圖／檔案：docs/ai-evidence/20261109-chiajungtien-b-diagrams-swimlanes-01a1ac49/turn-13.png、docs/ai-evidence/20261109-chiajungtien-b-diagrams-swimlanes-01a1ac49/transcript.md
- 對應文件章節：B（正式圖表整理）
- 狀態：待確認

## 5

- 日期：2026-11-09
- 成員：ChiaJungTien
- 軟工活動：測試
- 具體工作：同步 main 並執行 ship 前置檢查，因測試資料庫無法連線而停止。
- AI 工具／BMad 技能：Codex／ship
- Prompt 重點：取得遠端 main；透過 $ship 整理目前分支工作並執行必要檢查。
- AI 產出摘要：本機 main 快轉至 09dd7d9，工作區仍在 feat/goods-receipt，未合併 main。前端 lint、169 項測試與 build 通過；後端 Ruff 通過，整合測試連線 foodflow_test 逾時。依 ship 規則停止，未 commit、push 或開 PR。
- 人工判斷與修正：使用者要求拉取最新 main 並呼叫 $ship；測試失敗後未要求略過檢查。其餘人工判斷待本人補充。
- 採用程度：僅參考
- 截圖／檔案：docs/ai-evidence/20261109-chiajungtien-b-diagrams-swimlanes-01a1ac49/turn-14.png、docs/ai-evidence/20261109-chiajungtien-b-diagrams-swimlanes-01a1ac49/turn-15.png、docs/ai-evidence/20261109-chiajungtien-b-diagrams-swimlanes-01a1ac49/transcript.md
- 對應文件章節：F（測試與發布前檢查）、G（管理紀錄）
- 狀態：待確認

## 6

- 日期：2026-11-09
- 成員：ChiaJungTien
- 軟工活動：需求
- 具體工作：依現行 B 文件與範例建立確認入庫及 FEFO 領用泳道圖。
- AI 工具／BMad 技能：Codex／bmad-agent-analyst
- Prompt 重點：根據 GitHub 文件、G2 B 文件範例、分工 PDF 與 SRS 生成 FoodFlow 泳道圖，保持文件一致並參考謝文佳的負責範圍。
- AI 產出摘要：以員工／系統／資料庫三泳道產生 UC-06 確認入庫及 UC-11 FEFO 領用，各有 PUML／PNG／SVG，另附 docs/b-swimlane-diagrams.md 的步驟與例外對照；涵蓋驗證、非 FEFO 原因、交易回滾、重送與回應中斷。沿用 GitHub 首版邊界，不加入舊 PDF 的每日排程角色。
- 人工判斷與修正：使用者指定以既有文件為準，並提供範例及分工資料。尚未在對話中確認最終兩張泳道圖；人工審閱與採用判斷待本人補充。
- 採用程度：僅參考
- 截圖／檔案：docs/ai-evidence/20261109-chiajungtien-b-diagrams-swimlanes-01a1ac49/turn-18.png、docs/ai-evidence/20261109-chiajungtien-b-diagrams-swimlanes-01a1ac49/transcript.md
- 對應文件章節：B（泳道圖）、G（AI 使用紀錄）
- 狀態：待確認
