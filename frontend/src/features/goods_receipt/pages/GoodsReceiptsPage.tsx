import { Alert, Badge, Button, Fieldset, Group, Loader, Modal, Paper, Select, SimpleGrid, Stack, Text, TextInput, Textarea, Title } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router";

import { routes } from "../../../shared/routes";
import { PageHeader } from "../../../shared/ui/PageHeader";
import { ApiError, useConfirmReceipt, useDeleteReceipt, useReceipt, useReceiptOptions, useSaveReceipt, type Draft, type Option, type Receipt } from "../hooks";

import { ReceiptList } from "./ReceiptList";
import { ReceiptReversal } from "./ReceiptReversal";

function OpenReceipt() {
  const [params] = useSearchParams();
  const [number, setNumber] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  return <Paper withBorder p="lg" radius="md"><form onSubmit={(event) => {
    event.preventDefault();
    const match = /^(?:GR-)?([0-9]+)$/i.exec(number.trim());
    if (!match || Number(match[1]) < 1 || !Number.isSafeInteger(Number(match[1]))) {
      setError("請輸入有效單號，例如 GR-00000001"); return;
    }
    void navigate(`${routes.goodsReceipts}/${Number(match[1])}?${params}`);
  }}><Stack>
    <Title order={2} size="h4">重新開啟進貨單</Title>
    <Text size="sm" c="dimmed">輸入已知單號，繼續編輯草稿或查看已確認內容。</Text>
    <TextInput label="進貨單號" placeholder="GR-00000001" value={number} error={error}
      onChange={(event) => setNumber(event.currentTarget.value)} size="md" />
    <Group><Button type="submit" mih={44}>開啟進貨單</Button></Group>
  </Stack></form></Paper>;
}

function selectOptions(options: Option[] | undefined, old?: { id: number; name: string } | null, loaded = false) {
  const values = (options ?? []).map((option) => ({ value: String(option.id), label: option.code ? `${option.code} ${option.name}` : option.name }));
  if (old && !values.some((option) => option.value === String(old.id))) {
    values.push({ value: String(old.id), label: loaded ? `${old.name}（已停用）` : old.name });
  }
  return values;
}

type FormItem = { id?: number; ingredient_id: string; quantity: string; unit_price: string;
  expiry_date: string; location_id: string | null; note: string };
const emptyItem = (ingredientId = ""): FormItem => ({ ingredient_id: ingredientId,
  quantity: "", unit_price: "", expiry_date: "", location_id: "", note: "" });

function receiptValues(receipt: Receipt) {
  return { supplier_id: String(receipt.supplier_id), receipt_date: receipt.receipt_date,
    items: receipt.items.map((item): FormItem => ({ id: item.id, ingredient_id: String(item.ingredient_id),
      quantity: item.quantity ?? "", unit_price: item.unit_price ?? "", expiry_date: item.expiry_date ?? "",
      location_id: item.location_id === null ? "" : String(item.location_id), note: item.note ?? "" })) };
}
const localTime = (value: string) => new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
}).format(new Date(value));

function ReceiptForm({ receipt, ingredientId }: { receipt?: Receipt; ingredientId: string }) {
  const suppliers = useReceiptOptions("suppliers");
  const ingredients = useReceiptOptions("ingredients");
  const locations = useReceiptOptions("locations");
  const save = useSaveReceipt();
  const confirm = useConfirmReceipt();
  const remove = useDeleteReceipt();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [success, setSuccess] = useState<string>(location.state?.message ?? "");
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const readonly = receipt !== undefined && receipt.status !== "DRAFT";
  const form = useForm({ initialValues: receipt ? receiptValues(receipt) : {
    supplier_id: "", receipt_date: "", items: [emptyItem(ingredientId)],
  } });
  useEffect(() => {
    if (!receipt || (receipt.status === "DRAFT" && form.isDirty())) return;
    const values = receiptValues(receipt);
    form.setValues(values);
    form.resetDirty(values);
  }, [receipt]);

  async function submit(confirming: boolean) {
    if (submitting.current || readonly) return;
    submitting.current = true; setBusy(true); setSuccess(""); setError(""); form.clearErrors();
    const body: Draft = { supplier_id: Number(form.values.supplier_id), receipt_date: form.values.receipt_date,
      items: form.values.items.map((item) => ({ ...(item.id ? { id: item.id } : {}),
        ingredient_id: Number(item.ingredient_id), quantity: item.quantity === "" ? null : item.quantity,
        unit_price: item.unit_price === "" ? null : item.unit_price, expiry_date: item.expiry_date || null,
        location_id: item.location_id == null || item.location_id === "" ? null : Number(item.location_id), note: item.note.trim() || null })) };
    try {
      const saved = confirming && receipt && !form.isDirty()
        ? receipt : await save.mutateAsync({ id: receipt?.id, body });
      // Persisted input stays clean even if the confirmation response is lost: retry
      // can replay confirmation directly, without trying to edit a confirmed receipt.
      const savedValues = receiptValues(saved);
      form.setValues(savedValues);
      form.resetDirty(savedValues);
      if (confirming) {
        await confirm.mutateAsync(saved.id);
        setSuccess("進貨已確認入庫");
      } else if (receipt) setSuccess("草稿已儲存");
      if (!receipt) void navigate(`${routes.goodsReceipts}/${saved.id}?${params}`, { replace: true, state: { message: "草稿已建立" } });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "操作未完成，請再試一次");
      if (failure instanceof ApiError) {
        form.setErrors(Object.fromEntries(failure.fields.map((field) => [field.field, field.message])));
        const field = failure.fields[0]?.field;
        if (field) requestAnimationFrame(() => form.getInputNode(field)?.focus());
      }
    } finally { submitting.current = false; setBusy(false); }
  }

  async function deleteDraft() {
    if (!receipt || submitting.current) return;
    submitting.current = true; setBusy(true); setError(""); setSuccess("");
    try {
      await remove.mutateAsync(receipt.id);
      void navigate(`${routes.goodsReceipts}?${params}`, { state: { message: "草稿已刪除" } });
    } catch (failure) { setError(failure instanceof Error ? failure.message : "刪除未完成"); }
    finally { submitting.current = false; setBusy(false); }
  }

  const optionsError = suppliers.error ?? ingredients.error ?? locations.error;
  return <Stack>
    {success && <Alert color="green" role="status">{success}</Alert>}
    {error && <Alert color="red" title="操作未完成" role="alert">{error}</Alert>}
    {optionsError && !readonly && <Alert color="red" role="alert"><Stack gap="xs">
      <Text>無法載入選單：{optionsError.message}</Text>
      <Button variant="light" onClick={() => { void suppliers.refetch(); void ingredients.refetch(); void locations.refetch(); }}>重新載入選單</Button>
    </Stack></Alert>}
    {receipt && <Paper withBorder p="md" radius="md"><Group justify="space-between">
      <Text fw={600}>{receipt.receipt_number}</Text><Badge color={readonly ? "green" : "gray"}>{receipt.status === "CONFIRMED" ? "已確認" : receipt.status === "REVERSED" ? "已沖銷" : "草稿"}</Badge>
    </Group><Text size="sm" c="dimmed" mt="xs">建立人：{receipt.created_by_name} · {localTime(receipt.created_at)}</Text>
      {receipt.confirmed_at && <Text size="sm" c="dimmed">確認時間：{localTime(receipt.confirmed_at)}</Text>}
      {readonly && <Text mt="xs">此單為唯讀。</Text>}
    </Paper>}
    {receipt && <ReceiptReversal receipt={receipt} />}
    <form onSubmit={(event) => { event.preventDefault(); void submit(false); }} noValidate>
      <Stack>
        <Fieldset legend="進貨資料" disabled={busy || readonly} styles={{ root: { border: 0, padding: 0 } }}>
          <Paper withBorder p="lg" radius="md"><SimpleGrid cols={{ base: 1, sm: 2 }}>
            <Select label="供應商" required searchable placeholder="選擇供應商" size="md" data={selectOptions(suppliers.data, receipt ? { id: receipt.supplier_id, name: receipt.supplier_name } : null, suppliers.isSuccess)}
              {...form.getInputProps("supplier_id")} />
            <TextInput label="進貨日期" required type="date" size="md" {...form.getInputProps("receipt_date")} />
          </SimpleGrid></Paper>
          <Stack mt="lg">
            {form.values.items.map((item, index) => {
              const old = receipt?.items.find((value) => value.id === item.id);
              const unit = ingredients.data?.find((value) => String(value.id) === item.ingredient_id)?.unit ?? old?.unit;
              const field = (name: keyof FormItem) => form.getInputProps(`items.${index}.${name}`);
              return <Paper key={index} component="section" aria-label={`明細 ${index + 1}`} withBorder p="lg" radius="md">
                <Group justify="space-between" mb="md"><Title order={2} size="h4">明細 {index + 1}</Title>
                  {!readonly && <Button variant="subtle" color="red" mih={44} disabled={busy || form.values.items.length <= 1} onClick={() => form.removeListItem("items", index)}>移除明細 {index + 1}</Button>}
                </Group>
                {readonly && <Text mb="md">來源批次：{old?.batch_number ?? "—"}（ID：{old?.batch_id ?? "—"}）</Text>}
                <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
                  <Select label="食材" required searchable size="md" placeholder="選擇食材" data={selectOptions(ingredients.data, old ? { id: old.ingredient_id, name: old.ingredient_name } : null, ingredients.isSuccess)} {...field("ingredient_id")} />
                  <TextInput label={unit ? `數量（${unit}）` : "數量"} inputMode="decimal" size="md" placeholder="最多三位小數" {...field("quantity")} />
                  <TextInput label="單價" inputMode="decimal" size="md" placeholder="選填，0 為有效單價" {...field("unit_price")} />
                  <TextInput label="到期日" type="date" size="md" {...field("expiry_date")} />
                  <Select label="入庫位置" searchable clearable size="md" placeholder="選擇位置" rightSectionWidth={44}
                    clearButtonProps={{ "aria-label": "清除入庫位置", "aria-hidden": false, tabIndex: 0, style: { width: 44, height: 44, minWidth: 44, minHeight: 44 } }}
                    data={selectOptions(locations.data, old?.location_id ? { id: old.location_id, name: old.location_name ?? String(old.location_id) } : null, locations.isSuccess)} {...field("location_id")} />
                  <Textarea label="備註" maxLength={500} size="md" styles={{ input: { minHeight: 44 } }} autosize minRows={1} {...field("note")} />
                </SimpleGrid>
              </Paper>;
            })}
            {form.errors.items && <Text c="red" role="alert">{form.errors.items}</Text>}
            {!readonly && <Button variant="light" mih={44} onClick={() => form.insertListItem("items", emptyItem())} disabled={busy}>新增明細</Button>}
          </Stack>
        </Fieldset>
        {!readonly && <>
          <Text size="sm" c="dimmed">草稿可暫缺數量、到期日與位置。確認入庫時須全部填妥，確認後無法編輯。</Text>
          <Group justify="space-between">
            {receipt && <Button color="red" variant="subtle" mih={44} disabled={busy} onClick={() => setDeleting(true)}>刪除草稿</Button>}
            <Group><Button type="submit" variant="default" mih={44} loading={busy && !confirm.isPending} disabled={busy}>儲存草稿</Button>
              {receipt && <Button mih={44} loading={confirm.isPending} disabled={busy} onClick={() => void submit(true)}>確認入庫</Button>}
            </Group>
          </Group>
        </>}
      </Stack>
    </form>
    <Modal opened={deleting} title="刪除草稿" onClose={() => { if (!busy) setDeleting(false); }} centered closeOnClickOutside={!busy} closeOnEscape={!busy} withCloseButton={!busy}>
      <Stack><Text>確定刪除 {receipt?.receipt_number}？刪除後無法復原。</Text>
        {error && <Alert color="red" role="alert">{error}</Alert>}
        <Group justify="flex-end"><Button variant="default" mih={44} disabled={busy} onClick={() => setDeleting(false)}>取消</Button><Button color="red" mih={44} loading={busy} onClick={() => void deleteDraft()}>確認刪除</Button></Group>
      </Stack>
    </Modal>
  </Stack>;
}

export function GoodsReceiptsPage() {
  const { receiptId } = useParams();
  const location = useLocation();
  const [params] = useSearchParams();
  const isNew = location.pathname === routes.goodsReceiptNew;
  const id = receiptId && /^[1-9][0-9]*$/.test(receiptId) && Number.isSafeInteger(Number(receiptId)) ? Number(receiptId) : undefined;
  const receipt = useReceipt(id);
  const ingredientId = params.get("ingredient_id") ?? "";
  return <Stack gap="lg" maw={1200} mx="auto" pb="xl">
    <PageHeader title={isNew ? "新增進貨草稿" : receiptId ? "進貨單" : "進貨"} description="先儲存收貨明細，填妥後整單確認入庫。"
      actions={<Button component={Link} to={isNew || receiptId ? `${routes.goodsReceipts}?${params}` : `${routes.goodsReceiptNew}?${params}`} mih={44} variant={isNew || receiptId ? "default" : "filled"}>{isNew || receiptId ? "返回進貨" : "建立進貨草稿"}</Button>} />
    {isNew ? <ReceiptForm key={`new-${ingredientId}`} ingredientId={ingredientId} /> : receiptId ? <>
      {!id && <Alert color="red" role="alert">進貨單號格式錯誤</Alert>}
      {id && receipt.isPending && <Loader aria-label="載入進貨單" />}
      {receipt.error && <Alert color="red" role="alert"><Stack><Text>{receipt.error.message}</Text><Button onClick={() => void receipt.refetch()}>重新載入</Button></Stack></Alert>}
      {receipt.data && <ReceiptForm key={receipt.data.id} receipt={receipt.data} ingredientId="" />}
    </> : <>{location.state?.message && <Alert color="green" role="status">{location.state.message}</Alert>}<ReceiptList /><OpenReceipt /></>}
  </Stack>;
}
