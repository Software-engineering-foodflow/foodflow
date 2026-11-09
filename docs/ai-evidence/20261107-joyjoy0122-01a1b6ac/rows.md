# AI 使用紀錄列草稿：B 文件需求分析與使用案例

> 僅依本聊天 Session `01a1b6ac-0c9f-7942-891f-12476aa25c64` 整理。原始紀錄跨兩個檔案，已合併後節錄文件製作內容，保留原輪次編號；已移除 IDE 分頁、本機路徑、工具摘要及 Git 推送等非文件製作內容。對話圖依相同節錄重新排版產生，並非當時螢幕截圖。以下人工判斷欄僅摘錄對話中可見的要求與修正，請謝文佳本人檢查後再改為「已確認」。

## 紀錄 1

- 日期：2026-11-08
- 成員：謝文佳
- 軟工活動：需求
- 具體工作：編製 B 文件系統整體概述、功能需求分析、功能清單與說明。
- AI 工具／BMad 技能：Codex／bmad-agent-analyst（Mary）
- Prompt 重點：依 FoodFlow 現有 SRS 與分工要求產生內容，G2 範例僅參考架構；使用 SRS 名詞，不納入首版以外功能。
- AI 產出摘要：三份 B 文件中的系統定位與邊界、八大功能模組及 26 項細功能，並對應 FR-01～FR-18。
- 人工判斷與修正：使用者要求以 repo 文件為主要依據，指定在 docs 建立文件，並再次強調首版範圍與 SRS 用語；其餘待本人補充。
- 採用程度：
- 截圖／檔案：docs/ai-evidence/20261107-joyjoy0122-01a1b6ac/turn-07.png、docs/ai-evidence/20261107-joyjoy0122-01a1b6ac/turn-10.png、docs/ai-evidence/20261107-joyjoy0122-01a1b6ac/turn-11.png、docs/ai-evidence/20261107-joyjoy0122-01a1b6ac/transcript.md
- 對應文件章節：docs/b-system-overview.md；docs/b-functional-requirements.md
- 狀態：待確認

## 紀錄 2

- 日期：2026-11-08
- 成員：謝文佳
- 軟工活動：設計
- 具體工作：繪製、調整並選定完整使用案例圖。
- AI 工具／BMad 技能：Codex／bmad-agent-analyst（Mary）；PlantUML、draw.io、SVG
- Prompt 重點：完整呈現首版功能；圖形需接近正方形、標題加上「模組」、固定對齊並減少雜亂連線，另提供無角色泛化版本。
- AI 產出摘要：18 個使用案例、兩種角色、八大模組及需求對照表；產生有／無角色泛化兩種圖與可編輯原始檔。
- 人工判斷與修正：使用者否決初版過長與散亂的排版，要求兩欄排列、改善美觀並剪除框選的四段多餘線條；最終偏好無角色泛化版本，要求放在文件前面。共用幹線屬簡化呈現，其 UML 表達方式仍可於定稿時確認。
- 採用程度：大幅修改
- 截圖／檔案：docs/ai-evidence/20261107-joyjoy0122-01a1b6ac/turn-17.png、docs/ai-evidence/20261107-joyjoy0122-01a1b6ac/turn-18.png、docs/ai-evidence/20261107-joyjoy0122-01a1b6ac/turn-22.png、docs/ai-evidence/20261107-joyjoy0122-01a1b6ac/transcript.md
- 對應文件章節：docs/b-system-analysis.md／一、使用案例圖；docs/diagrams/b-use-case-no-generalization.drawio
- 狀態：待確認

## 紀錄 3

- 日期：2026-11-08
- 成員：謝文佳
- 軟工活動：需求
- 具體工作：撰寫兩份核心 Detail Use Case。
- AI 工具／BMad 技能：Codex／bmad-agent-analyst（Mary）
- Prompt 重點：區分使用案例圖、架構圖與流程圖，依分工產生兩個核心使用案例的詳細規格。
- AI 產出摘要：UC-06 確認入庫與 UC-11 FEFO 領用，包含角色、需求對應、前置條件、觸發事件、主流程、替代流程、例外與後置條件。
- 人工判斷與修正：使用者確認文件定位後，指定產生兩份詳細規格；規格內容的逐條採用判斷待本人補充。
- 採用程度：
- 截圖／檔案：docs/ai-evidence/20261107-joyjoy0122-01a1b6ac/turn-24.png、docs/ai-evidence/20261107-joyjoy0122-01a1b6ac/turn-25.png、docs/ai-evidence/20261107-joyjoy0122-01a1b6ac/transcript.md
- 對應文件章節：docs/b-system-analysis.md／二、核心 Use Case 規格說明
- 狀態：待確認

## 紀錄 4

- 日期：2026-11-08
- 成員：謝文佳
- 軟工活動：審查
- 具體工作：核對文件與期中報告要求、修正分工判讀。
- AI 工具／BMad 技能：Codex／bmad-agent-analyst（Mary）
- Prompt 重點：確認已生成內容是否符合分工與系統設計，以及使用案例數量、切割理由與兩份詳細規格是否涵蓋報告重點。
- AI 產出摘要：列出已完成文件、兩張泳道圖的原分工要求、首版不含排程的依據，以及共用連線幹線的 UML 表達限制。
- 人工判斷與修正：AI 依 repo 舊分工將泳道圖列為使用者待辦；使用者指出最後分工已交由其他組員，AI 因此修正，不再列為謝文佳未完成項目。
- 採用程度：小幅修改
- 截圖／檔案：docs/ai-evidence/20261107-joyjoy0122-01a1b6ac/turn-26.png、docs/ai-evidence/20261107-joyjoy0122-01a1b6ac/turn-27.png、docs/ai-evidence/20261107-joyjoy0122-01a1b6ac/transcript.md
- 對應文件章節：B 文件前半與期中報告分工核對
- 狀態：待確認
