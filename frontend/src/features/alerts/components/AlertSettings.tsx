import { Alert, Button, Group, Skeleton, Stack, TextInput } from "@mantine/core";
import { useState } from "react";
import { FormModal } from "../../../shared/ui/FormModal";
import { settingFieldError, useAlertSettings, useUpdateAlertSettings } from "../hooks";
export function AlertSettings({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const query = useAlertSettings(opened);
  const mutation = useUpdateAlertSettings();
  const [value, setValue] = useState<string | null>(null);
  const [invalid, setInvalid] = useState("");
  const input = value ?? String(query.data?.warning_days ?? "");
  const fieldError = settingFieldError(mutation.error);
  return <FormModal opened={opened} title="預警設定" busy={mutation.isPending} onClose={onClose}>
    <form onSubmit={async event => {
      event.preventDefault();
      if (query.error || !query.data || mutation.isPending) return;
      if (!/^[0-9]+$/.test(input) || !Number.isSafeInteger(Number(input))) { setInvalid("須為非負整數"); return; }
      setInvalid("");
      try { await mutation.mutateAsync(Number(input)); onClose(); } catch { /* preserve input */ }
    }}><Stack>
      {query.isPending ? <Skeleton h={72} /> : query.error ? <Alert color="red" role="alert">
        無法載入設定<Button variant="default" onClick={() => void query.refetch()}>重試</Button>
      </Alert> : <TextInput label="提前預警天數" description="設為 0 時，僅提醒過期與今日到期。"
        inputMode="numeric" value={input} disabled={mutation.isPending} error={invalid || fieldError}
        onChange={event => { setValue(event.currentTarget.value); setInvalid(""); mutation.reset(); }} />}
      {mutation.error && !fieldError && <Alert color="red" role="alert">{mutation.error.message}</Alert>}
      <Group justify="flex-end"><Button variant="default" disabled={mutation.isPending} onClick={onClose}>取消</Button>
        <Button type="submit" loading={mutation.isPending} disabled={!!query.error || !query.data}>儲存設定</Button></Group>
    </Stack></form>
  </FormModal>;
}
