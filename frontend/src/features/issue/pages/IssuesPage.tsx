import {
  Alert, Badge, Button, Group, Paper, Stack, Table, Text, TextInput,
} from "@mantine/core";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";

import { useIdempotencyKey } from "../../../shared/hooks/useIdempotencyKey";
import { CodeTag } from "../../../shared/ui/CodeTag";
import { DataTable } from "../../../shared/ui/DataTable";
import { EmptyState } from "../../../shared/ui/EmptyState";
import { PageHeader } from "../../../shared/ui/PageHeader";
import { StatusBadge } from "../../../shared/ui/StatusBadge";
import { OutboxIcon } from "../../../shared/ui/icons";
import { Quantity, formatQuantity } from "../../../shared/ui/Quantity";
import { IngredientPicker } from "../components/IngredientPicker";
import { RecentIssues } from "../components/RecentIssues";
import { motion, stagger } from "../motion";
import {
  useCreateIssue, useIssuableIngredients, useIssueSuggestion,
  type IssueLineRequest, type IssueResult, type IssueSuggestion, type IssueSuggestionRequest,
} from "../hooks";

/** 常見單位的較小單位，只用在輸入說明的固定範例，不做換算（A2：每項食材一種單位）。 */
const SMALLER_UNITS: Record<string, string> = { 公斤: "公克", kg: "公克", 公升: "毫升", L: "毫升" };

/** allowsFraction 來自後端（domain/units.py），前端不自己判斷單位能不能有小數。 */
function quantityHint(unit: string, allowsFraction: boolean): string {
  if (!allowsFraction) return `「${unit}」只能填整數`;
  const smaller = SMALLER_UNITS[unit];
  return smaller ? `最多三位小數，例如 0.25 ${unit} = 250 ${smaller}` : `可填小數（最多三位），例如 0.5 ${unit}`;
}

/** 改完領用量後等這麼久才重新檢查，避免每打一個字就送一次請求。 */
const CHECK_DELAY_MS = 400;
const CARD_PADDING = 20;

interface RowDraft { quantity: string; reason: string }
type Drafts = Record<number, RowDraft>;
interface RowErrors { batch?: string; quantity?: string; reason?: string }

/** 後端統一錯誤格式（AD-16）；元件不可 import client.ts，所以用結構判斷。 */
interface ErrorLike { code: string; message: string; details: Record<string, unknown>; fields: { field: string; message: string }[] }
function asApiError(error: unknown): ErrorLike | null {
  if (error && typeof error === "object" && "code" in error && "fields" in error && Array.isArray(error.fields)) {
    return error as ErrorLike;
  }
  return null;
}

/** 把 `lines.N.xxx` 對回送出時第 N 行的批次。 */
function rowErrors(error: ErrorLike | null, lines: { batch_id: number }[]): Record<number, RowErrors> {
  const result: Record<number, RowErrors> = {};
  for (const item of error?.fields ?? []) {
    const match = /^lines\.(\d+)\.(batch_id|quantity|reason)$/.exec(item.field);
    const line = match ? lines[Number(match[1])] : undefined;
    if (!match || !line) continue;
    const key = match[2] === "batch_id" ? "batch" : match[2] as "quantity" | "reason";
    result[line.batch_id] = { ...result[line.batch_id], [key]: item.message };
  }
  return result;
}

/** 可用量不足時寫出可以採取的行動；數字全部是後端回傳的字串。 */
function errorText(error: ErrorLike, view: IssueSuggestion | undefined, unit: string): string {
  if (error.code !== "INSUFFICIENT_STOCK") return error.message;
  const available = error.details.available_quantity;
  const batchId = error.details.batch_id;
  if (batchId != null) {
    const batch = view?.candidates.find((item) => item.batch_id === batchId);
    const name = batch ? `批次 ${batch.batch_number}` : "這個批次";
    return `${name}剩餘量只有 ${formatQuantity(String(error.details.remaining_quantity))} ${unit}`
      + `（可用量 ${formatQuantity(String(available))} ${unit}），請調整數量`;
  }
  return `可用量只有 ${formatQuantity(String(available))} ${unit}，請調整數量`;
}

/** 只送畫面上看得到原因欄的那幾行原因；改回照 FEFO 後隱藏的舊原因不送。 */
function selectedLines(
  view: IssueSuggestion | undefined, drafts: Drafts, reasonRows: ReadonlySet<number>,
): IssueLineRequest[] {
  return (view?.candidates ?? []).flatMap((item) => {
    const draft = drafts[item.batch_id];
    const quantity = draft?.quantity.trim() ?? "";
    if (!quantity) return [];
    const reason = reasonRows.has(item.batch_id) ? draft?.reason.trim() : "";
    return [{ batch_id: item.batch_id, quantity, ...(reason ? { reason } : {}) }];
  });
}

function mergeRowErrors(...groups: Record<number, RowErrors>[]): Record<number, RowErrors> {
  const result: Record<number, RowErrors> = {};
  for (const group of groups) {
    for (const [id, errors] of Object.entries(group)) result[Number(id)] = { ...result[Number(id)], ...errors };
  }
  return result;
}

function IssueSummary({ result, unit, name, onClose }: {
  result: IssueResult; unit: string; name: string; onClose: () => void;
}) {
  return <Alert color="green" role="status" withCloseButton onClose={onClose} title={`已領用 ${name}`}
    className={motion.reveal}>
    <Stack gap={4}>
      {result.lines.map((line) => <Text key={line.transaction_id} size="sm">
        <CodeTag code={line.batch_number} /> 領用 <Quantity value={line.quantity} unit={unit} />，剩{" "}
        <Quantity value={line.quantity_after} unit={unit} strong={false} />
        {line.is_non_fefo && `（未依先到期先使用：${line.reason}）`}
      </Text>)}
    </Stack>
  </Alert>;
}

export function IssuesPage() {
  const [params] = useSearchParams();
  const ingredients = useIssuableIngredients();
  const [ingredientId, setIngredientId] = useState<string | null>(params.get("ingredient_id"));
  const [quantity, setQuantity] = useState("");
  const [request, setRequest] = useState<IssueSuggestionRequest | null>(null);
  const [view, setView] = useState<IssueSuggestion>();
  const [drafts, setDrafts] = useState<Drafts>({});
  const [edited, setEdited] = useState(0);
  const [submitted, setSubmitted] = useState<IssueLineRequest[]>([]);
  const [done, setDone] = useState<{ result: IssueResult; name: string; unit: string } | null>(null);
  const suggestion = useIssueSuggestion(request);
  const create = useCreateIssue();
  const { key, rotate } = useIdempotencyKey();
  const appliedAt = useRef(0);
  const checkTimer = useRef<number | undefined>(undefined);
  const [checkPending, setCheckPending] = useState(false);

  const ingredient = ingredients.data?.items.find((item) => String(item.id) === ingredientId);
  const unit = view?.unit ?? ingredient?.unit ?? "";

  // 每次請求回來（含同條件重抓、領用後失效重抓）都採用；FEFO 建議（quantity 模式）以建議量預填各列。
  useEffect(() => {
    const data = suggestion.data;
    if (!data || !request || suggestion.isPlaceholderData || suggestion.dataUpdatedAt === appliedAt.current) return;
    appliedAt.current = suggestion.dataUpdatedAt;
    setView(data);
    if ("quantity" in request && request.quantity) {
      setDrafts(Object.fromEntries(data.candidates.map((item) => [item.batch_id,
        { quantity: item.quantity === "0.000" ? "" : formatQuantity(item.quantity), reason: "" }])));
    }
  }, [request, suggestion.data, suggestion.isPlaceholderData, suggestion.dataUpdatedAt]);

  const suggestionError = asApiError(suggestion.error);
  const submitError = asApiError(create.error);
  const checkedLines = request && "lines" in request && request.lines ? request.lines : [];
  const errorsByRow = mergeRowErrors(rowErrors(suggestionError, checkedLines), rowErrors(submitError, submitted));
  const reasonRows = new Set((view?.candidates ?? [])
    .filter((item) => item.is_non_fefo || errorsByRow[item.batch_id]?.reason)
    .map((item) => item.batch_id));
  const reasonKey = [...reasonRows].join(",");
  // reasonKey 代表 reasonRows 的內容，Set 本身每次 render 都是新物件。
  const lines = useMemo(() => selectedLines(view, drafts, reasonRows), [view, drafts, reasonKey]);

  const cancelCheck = useCallback(() => {
    window.clearTimeout(checkTimer.current);
    setCheckPending(false);
  }, []);

  // 員工改了領用量：停止輸入後以這些明細重新檢查哪幾行非 FEFO（前端不自己判定）。
  useEffect(() => {
    if (!edited || !ingredientId) return;
    setCheckPending(true);
    checkTimer.current = window.setTimeout(() => {
      setCheckPending(false);
      const checking = selectedLines(view, drafts, new Set()).map(({ batch_id, quantity: value }) =>
        ({ batch_id, quantity: value }));
      if (checking.length) setRequest({ ingredient_id: Number(ingredientId), lines: checking });
    }, CHECK_DELAY_MS);
    return () => window.clearTimeout(checkTimer.current);
    // 只在員工改了領用量時重新排程；view、drafts 取自觸發當下的 render。
  }, [edited]);

  // AD-8：送出內容改變才換 key；同內容重按沿用同一把，伺服器回原結果。
  const content = JSON.stringify([ingredientId, lines]);
  useEffect(() => { rotate(); }, [content, rotate]);

  const resetDraft = useCallback(() => {
    cancelCheck();
    setRequest(null); setView(undefined); setDrafts({}); setSubmitted([]);
    create.reset();
  }, [cancelCheck, create]);

  function chooseIngredient(value: string | null) {
    setIngredientId(value);
    setDone(null);
    resetDraft();
  }

  function suggest() {
    if (!ingredientId) return;
    setDone(null);
    cancelCheck();
    setSubmitted([]);
    setView(undefined);
    setDrafts({});
    create.reset();
    const next = { ingredient_id: Number(ingredientId), quantity: quantity.trim() };
    if (JSON.stringify(next) === JSON.stringify(request)) void suggestion.refetch();
    else setRequest(next);
  }

  function editRow(batchId: number, change: Partial<RowDraft>, recheck: boolean) {
    setDrafts((current) => ({ ...current,
      [batchId]: { ...(current[batchId] ?? { quantity: "", reason: "" }), ...change } }));
    // 改過輸入後，上一次送出的錯誤已經不代表目前內容。
    if (create.isError) create.reset();
    if (recheck) setEdited((count) => count + 1);
  }

  async function confirm() {
    if (!ingredientId || !lines.length) return;
    setSubmitted(lines);
    const name = view?.ingredient_name ?? "";
    const result = await create.mutateAsync({
      body: { ingredient_id: Number(ingredientId), lines }, idempotencyKey: key,
    }).catch(() => undefined);
    if (!result) return;
    setDone({ result, name, unit });
    setQuantity("");
    resetDraft();
    rotate();
  }

  const quantityError = suggestionError?.fields.find((item) => item.field === "quantity")?.message;
  const ingredientError = [suggestionError, submitError].flatMap((item) => item?.fields ?? [])
    .find((item) => item.field === "ingredient_id")?.message;
  const missingIngredient = ingredientId !== null && ingredients.isSuccess && !ingredient;
  const shownView = view && String(view.ingredient_id) === ingredientId ? view : undefined;
  const allowsFraction = shownView?.allows_fraction ?? ingredient?.allows_fraction ?? true;
  const checking = checkPending || (suggestion.isFetching && checkedLines.length > 0);

  return (
    <Stack gap="lg" maw={1200} mx="auto">
      <div className={motion.enter}>
        <PageHeader icon={<OutboxIcon size={20} />} title="領用"
          description="選擇食材與數量，系統依到期日建議先拿哪幾批" />
      </div>

      {done && <IssueSummary {...done} onClose={() => setDone(null)} />}

      <Paper p={CARD_PADDING} radius="xl" className={`ff-card ${motion.enter}`} style={stagger(0, 80)}>
        <Stack gap="md">
          {ingredients.error && <Alert color="red" title="無法載入食材" role="alert"><Stack gap="sm">
            <Text size="sm">{ingredients.error.message}</Text>
            <Group><Button variant="default" className={motion.press}
              onClick={() => void ingredients.refetch()}>重試</Button></Group>
          </Stack></Alert>}

          <form noValidate onSubmit={(event) => { event.preventDefault(); suggest(); }}>
            {/* 食材與需要數量同一列，label、輸入框、說明各自對齊。 */}
            <Group align="flex-start" gap="md" wrap="wrap">
              <div style={{ flex: "1 1 320px", minWidth: 0 }}>
                <IngredientPicker items={ingredients.data?.items ?? []} value={ingredientId}
                  onChange={chooseIngredient} error={ingredientError} />
              </div>
              <TextInput label="需要數量" required inputMode={allowsFraction ? "decimal" : "numeric"} value={quantity}
                w={220} description={unit ? quantityHint(unit, allowsFraction) : undefined}
                inputWrapperOrder={["label", "input", "description", "error"]}
                onChange={(event) => setQuantity(event.currentTarget.value)} error={quantityError}
                rightSection={<Text size="xs" c="dimmed">{unit}</Text>} rightSectionWidth={44} />
              <Button type="submit" variant="default" mt={21} className={motion.press}
                disabled={!ingredientId || !quantity.trim()}
                loading={suggestion.isFetching && request !== null && "quantity" in request}>
                取得建議
              </Button>
            </Group>
          </form>

          {missingIngredient && <Alert color="blue" role="status" className={motion.reveal}>
            這項食材目前沒有可領用的庫存，請改選其他食材或先進貨。
          </Alert>}

          {suggestionError && !quantityError && <Alert color="red" role="alert" title="無法取得建議"
            className={motion.reveal}>
            {errorText(suggestionError, shownView, unit)}
          </Alert>}

          {shownView ? <CandidateTable view={shownView} drafts={drafts} errors={errorsByRow}
            onEdit={editRow} /> : !suggestionError && <EmptyState title="尚未取得建議"
            description="選好食材並輸入需要的數量，再按「取得建議」" />}

          {submitError && <Alert color="red" role="alert" title="領用沒有完成，庫存未變動"
            className={motion.reveal}>
            {errorText(submitError, shownView, unit)}
          </Alert>}

          {shownView && <Group justify="space-between" align="center" wrap="wrap" gap="sm" className={motion.reveal}>
            <Text size="sm" c="dimmed" aria-live="polite">
              {checking && "正在檢查是否照先到期先使用…・"}本次領用{" "}
              <Quantity value={shownView.requested_quantity} unit={unit} />・全部可用{" "}
              <Quantity value={shownView.available_quantity} unit={unit} strong={false} />
            </Text>
            <Button onClick={() => void confirm()} loading={create.isPending} disabled={!lines.length || checking}
              className={motion.press}>
              確認領用
            </Button>
          </Group>}
        </Stack>
      </Paper>

      <div className={motion.enter} style={stagger(1, 160)}><RecentIssues /></div>
    </Stack>
  );
}

function CandidateTable({ view, drafts, errors, onEdit }: {
  view: IssueSuggestion;
  drafts: Drafts;
  errors: Record<number, RowErrors>;
  onEdit: (batchId: number, change: Partial<RowDraft>, recheck: boolean) => void;
}) {
  if (!view.candidates.length) {
    return <EmptyState title="沒有可領用的批次" description="這項食材的批次都已過期或用完" />;
  }
  return <Stack gap="xs">
    {view.candidates.length > 1 && <Alert color="blue" variant="light" role="note" title="想改拿別的批次？"
      className={motion.reveal}>
      把建議那列的領用量清空，在要拿的批次填數量；停一下系統會重新檢查，沒照先到期先使用的列會出現「非 FEFO」和必填的原因欄。
    </Alert>}
    <Text size="xs" c="dimmed">依到期日排序，最早到期在前。</Text>
    {/* 1024×768 時卡片內約 700px；放不下時只在表格外框內捲動，頁面不捲動。 */}
    <DataTable label={`${view.ingredient_name} 的領用批次`} minWidth={680} head={<>
      <Table.Th>批號</Table.Th>
      <Table.Th>位置</Table.Th>
      <Table.Th>到期日</Table.Th>
      <Table.Th ta="right">可用量</Table.Th>
      <Table.Th ta="right">領用量</Table.Th>
    </>}>
      {view.candidates.map((item, index) => {
        const draft = drafts[item.batch_id] ?? { quantity: "", reason: "" };
        const error = errors[item.batch_id] ?? {};
        const needsReason = item.is_non_fefo || Boolean(error.reason);
        return <Fragment key={item.batch_id}>
          <Table.Tr data-batch={item.batch_number} className={motion.enter} style={stagger(index, 40)}>
            <Table.Td><Stack gap={2}><CodeTag code={item.batch_number} />
              {error.batch && <Text size="xs" c="expired.8">{error.batch}</Text>}</Stack></Table.Td>
            <Table.Td><Text size="sm" fw={700}>{item.location_name}</Text>
              <Text size="xs" c="dimmed">{item.location_code}</Text></Table.Td>
            <Table.Td><Stack gap={2} align="flex-start">
              <Text size="sm" style={{ fontVariantNumeric: "tabular-nums" }}>{item.expiry_date}</Text>
              <Group gap={6}><StatusBadge status={item.expiry_status} />
                <Text span size="xs" c="dimmed">
                  {item.days_until_expiry === 0 ? "今天到期" : `還有 ${item.days_until_expiry} 天`}
                </Text></Group>
            </Stack></Table.Td>
            <Table.Td ta="right" style={{ fontVariantNumeric: "tabular-nums" }}>
              <Quantity value={item.remaining_quantity} unit={view.unit} />
            </Table.Td>
            <Table.Td>
              <Stack gap={4} align="flex-end">
                <TextInput aria-label={`${item.batch_number} 領用量`} inputMode={view.allows_fraction ? "decimal" : "numeric"} w={130}
                  value={draft.quantity} error={error.quantity}
                  onChange={(event) => onEdit(item.batch_id, { quantity: event.currentTarget.value }, true)}
                  rightSection={<Text size="xs" c="dimmed">{view.unit}</Text>} rightSectionWidth={36} />
                {item.is_non_fefo && <Badge color="gray" variant="outline" className={motion.reveal}>非 FEFO</Badge>}
              </Stack>
            </Table.Td>
          </Table.Tr>
          {needsReason && <Table.Tr data-reason-for={item.batch_number} className={motion.reveal}>
            <Table.Td colSpan={5}>
              <TextInput label="沒有照先到期先使用的原因（必填）" required value={draft.reason}
                error={error.reason} placeholder="例如：較早到期的那批放在冷凍庫最裡面"
                onChange={(event) => onEdit(item.batch_id, { reason: event.currentTarget.value }, false)} />
            </Table.Td>
          </Table.Tr>}
        </Fragment>;
      })}
    </DataTable>
  </Stack>;
}
