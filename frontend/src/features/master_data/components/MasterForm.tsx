import { Alert, Button, Group, Select, Stack, Text, Textarea, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useEffect, useState } from "react";

import { storageTypeOptions } from "../../../shared/storageTypes";
import { FormModal } from "../../../shared/ui/FormModal";
import { mutationFields, useActiveMasters, useMasterMutation, type Master, type MasterBody, type Resource } from "../hooks";

export function MasterForm({ resource, record, onSaved, onCancel, onBusy }: {
  resource: Resource; record: Master | null; onSaved: (message: string) => void;
  onCancel: () => void; onBusy: (busy: boolean) => void;
}) {
  const mutation = useMasterMutation(resource);
  const categories = useActiveMasters("ingredient-categories", resource === "ingredients");
  const [confirming, setConfirming] = useState(false);
  const form = useForm({ initialValues: {
    name: record?.name ?? "", code: record && "code" in record ? record.code : "",
    description: record && "description" in record ? record.description ?? "" : "",
    category_id: record && "category_id" in record ? String(record.category_id) : "",
    unit: record && "unit" in record ? record.unit : "",
    storage_method: record && "storage_method" in record ? record.storage_method : "",
    safety_stock_quantity: record && "safety_stock_quantity" in record ? record.safety_stock_quantity ?? "" : "",
    contact_person: record && "contact_person" in record ? record.contact_person ?? "" : "",
    phone: record && "phone" in record ? record.phone ?? "" : "",
    other_contact: record && "other_contact" in record ? record.other_contact ?? "" : "",
  } });
  useEffect(() => { onBusy(mutation.isPending); return () => onBusy(false); }, [mutation.isPending, onBusy]);
  function body(): MasterBody {
    const v = form.values;
    if (resource === "ingredient-categories") return { name: v.name.trim(), code: v.code.trim(), description: v.description.trim() || null };
    if (resource === "suppliers") return { name: v.name.trim(), contact_person: v.contact_person.trim() || null,
      phone: v.phone.trim() || null, other_contact: v.other_contact.trim() || null };
    return { name: v.name.trim(), category_id: Number(v.category_id), unit: v.unit.trim(),
      storage_method: v.storage_method as "REFRIGERATED" | "FROZEN" | "AMBIENT",
      safety_stock_quantity: v.safety_stock_quantity.trim() };
  }
  function save(active = record?.is_active ?? true) {
    if (mutation.isPending) return;
    form.clearErrors();
    mutation.mutate({ body: record ? { ...body(), is_active: active } : body(), id: record?.id }, {
      onSuccess: () => onSaved(`${form.values.name.trim()} 已${record ? "更新" : "建立"}`),
      onError: (error) => form.setErrors(mutationFields(error)),
    });
  }
  const options = (categories.data ?? []).map(item => ({ value: String(item.id), label: item.name }));
  if (record && "category_id" in record && !options.some(item => item.value === String(record.category_id))) {
    options.push({ value: String(record.category_id), label: `${record.category_name}（原分類）` });
  }
  return <>
    <form onSubmit={form.onSubmit(() => save())} noValidate><fieldset disabled={mutation.isPending} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}><Stack>
      {mutation.error && <Alert color="red" role="alert">{mutation.error.message}</Alert>}
      <TextInput label="名稱（必填）" aria-required="true" maxLength={100} {...form.getInputProps("name")} />
      {resource === "ingredient-categories" && <>
        <TextInput label="分類代碼（必填）" aria-required="true" maxLength={32} {...form.getInputProps("code")} />
        <Textarea label="說明" maxLength={500} {...form.getInputProps("description")} />
      </>}
      {resource === "ingredients" && <>
        {categories.error && <Alert color="red">無法載入分類<Button variant="default" onClick={() => void categories.refetch()}>重試</Button></Alert>}
        <Select label="分類（必填）" aria-required="true" data={options} searchable {...form.getInputProps("category_id")} />
        <TextInput label="庫存單位（必填）" aria-required="true" description="固定單位，不自動換算；有歷史資料後不能更換" maxLength={16} {...form.getInputProps("unit")} />
        <Select label="保存方式（必填）" aria-required="true" data={storageTypeOptions} {...form.getInputProps("storage_method")} />
        <TextInput label="安全庫存量" inputMode="decimal" description="留空視為 0.000（不提醒），最多三位小數" {...form.getInputProps("safety_stock_quantity")} />
      </>}
      {resource === "suppliers" && <>
        <Text size="sm" c="dimmed">聯絡人、電話或其他聯絡資訊至少填寫一項。</Text>
        <TextInput label="聯絡人" maxLength={100} {...form.getInputProps("contact_person")} />
        <TextInput label="電話" maxLength={32} {...form.getInputProps("phone")} />
        <Textarea label="其他聯絡資訊" maxLength={255} {...form.getInputProps("other_contact")} />
      </>}
      <Group justify="flex-end">
        <Button variant="default" disabled={mutation.isPending} onClick={onCancel}>取消</Button>
        {record && <Button variant="default" disabled={mutation.isPending} onClick={() => record.is_active ? setConfirming(true) : save(true)}>
          {record.is_active ? "停用" : "重新啟用"}</Button>}
        <Button type="submit" loading={mutation.isPending}>儲存</Button>
      </Group>
    </Stack></fieldset></form>
    <FormModal opened={confirming} title={`停用 ${record?.name}？`} kind="confirm" busy={mutation.isPending} onClose={() => setConfirming(false)}>
      <Stack><Text>{resource === "ingredient-categories"
        ? "停用後不能用於新增食材或更換食材分類，歷史資料會保留。"
        : resource === "ingredients"
          ? "停用後不能用於新進貨，既有庫存仍可領用、報廢與查詢。"
          : "停用後不能用於新進貨，歷史進貨單會保留。"}</Text>
        {mutation.error && <Alert color="red" role="alert">{mutation.error.message}</Alert>}
        <Group justify="flex-end"><Button variant="default" disabled={mutation.isPending} onClick={() => setConfirming(false)}>取消</Button>
          <Button color="red" loading={mutation.isPending} onClick={() => save(false)}>確認停用</Button></Group>
      </Stack>
    </FormModal>
  </>;
}
