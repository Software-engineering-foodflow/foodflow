import {
  Alert, Badge, Button, Group, Paper, Skeleton, Stack, Table, Text, Textarea, Title,
} from "@mantine/core";
import dayjs from "dayjs";
import { useState } from "react";

import { CodeTag } from "../../../shared/ui/CodeTag";
import { DataTable } from "../../../shared/ui/DataTable";
import { EmptyState } from "../../../shared/ui/EmptyState";
import { FormModal } from "../../../shared/ui/FormModal";
import { Quantity } from "../../../shared/ui/Quantity";
import { useRecentIssues, useReverseIssue, type IssueRecord } from "../hooks";
import { motion, stagger } from "../motion";

const CARD_PADDING = 20;
const time = (value: string) => dayjs(value).format("MM/DD HH:mm");

/** 錯誤欄位沿用後端統一格式（AD-16）；元件不可 import client.ts，所以用結構判斷。 */
function fieldError(error: unknown, field: string): string | undefined {
  if (error && typeof error === "object" && "fields" in error && Array.isArray(error.fields)) {
    return error.fields.find((item: { field: string; message: string }) => item.field === field)?.message;
  }
  return undefined;
}

/** 沖銷整次領用：數量加回各批次，另寫一筆連回原紀錄的沖銷，原紀錄保留（AD-5）。 */
function ReverseIssue({ record, onClose }: { record: IssueRecord; onClose: () => void }) {
  const reverse = useReverseIssue();
  const [reason, setReason] = useState("");
  const reasonError = fieldError(reverse.error, "reason");
  return <FormModal opened kind="confirm" busy={reverse.isPending} onClose={onClose}
    title={`沖銷 ${time(record.occurred_at)} 的${record.ingredient_name}領用？`}>
    <form noValidate onSubmit={(event) => {
      event.preventDefault();
      reverse.mutate({ groupId: record.operation_group_id, reason }, { onSuccess: onClose });
    }}>
      <Stack gap="md">
        <Text size="sm">
          下列數量會加回各批次；原紀錄會保留，並另外記下這次沖銷。領錯數量時，先沖銷再重新領用。
        </Text>
        <Stack gap={4}>
          {record.lines.map((line) => <Text key={line.transaction_id} size="sm">
            <CodeTag code={line.batch_number} /> 加回 <Quantity value={line.quantity} unit={record.unit} />
          </Text>)}
        </Stack>
        <Textarea label="沖銷原因（必填）" required rows={3} value={reason}
          error={reasonError} placeholder="例如：數量填錯，實際只拿了 2 公斤"
          onChange={(event) => setReason(event.currentTarget.value)} />
        {reverse.error && !reasonError && <Alert color="red" role="alert" className={motion.reveal}>
          {reverse.error.message}</Alert>}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={reverse.isPending} className={motion.press}>取消</Button>
          <Button type="submit" color="red" loading={reverse.isPending} className={motion.press}>確認沖銷</Button>
        </Group>
      </Stack>
    </form>
  </FormModal>;
}

/**
 * 最近幾次領用（唯讀），每次領用一列；依條件查詢所有異動屬於 FR-17（Epic 8）。
 * 領用或沖銷成功後 invalidateStockQueries() 會一併重新載入。
 */
export function RecentIssues() {
  const records = useRecentIssues();
  const [reversing, setReversing] = useState<IssueRecord | null>(null);
  return <Paper p={CARD_PADDING} radius="xl" className="ff-card">
    <Stack gap="md">
      <Group justify="space-between" align="baseline">
        <Title order={2} size="h4">最近領用紀錄</Title>
        <Text size="xs" c="dimmed">最新的 20 次，新到舊；填錯時用「沖銷」更正</Text>
      </Group>
      {records.isPending && <Stack gap="xs" aria-label="載入領用紀錄">
        {[0, 1, 2].map((index) => <Skeleton key={index} height={52} radius="md" />)}
      </Stack>}
      {records.error && <Alert color="red" title="無法載入領用紀錄" role="alert" className={motion.reveal}><Stack gap="sm">
        <Text size="sm">{records.error.message}</Text>
        <Group><Button variant="default" className={motion.press}
          onClick={() => void records.refetch()}>重試</Button></Group>
      </Stack></Alert>}
      {records.data && (records.data.items.length === 0
        ? <EmptyState title="還沒有領用紀錄" description="完成第一次領用後會列在這裡" />
        : <DataTable label="最近領用紀錄" minWidth={680} head={<>
          <Table.Th>時間</Table.Th>
          <Table.Th>食材</Table.Th>
          <Table.Th>批次與數量</Table.Th>
          <Table.Th>操作者</Table.Th>
          <Table.Th ta="center" w={1} style={{ whiteSpace: "nowrap" }}>操作</Table.Th>
        </>}>
          {records.data.items.map((record, index) => {
            const reversed = record.reversal;
            return <Table.Tr key={record.operation_group_id} data-record={record.operation_group_id}
              className={motion.enter} style={stagger(index, 40)}>
              <Table.Td style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                {time(record.occurred_at)}
              </Table.Td>
              <Table.Td><Text size="sm" fw={700} c={reversed ? "dimmed" : undefined}>{record.ingredient_name}</Text></Table.Td>
              <Table.Td><Stack gap={4}>
                {record.lines.map((line) => <Stack key={line.transaction_id} gap={0}>
                  <Text size="sm" c={reversed ? "dimmed" : undefined} td={reversed ? "line-through" : undefined}>
                    <CodeTag code={line.batch_number} /> 領用 <Quantity value={line.quantity} unit={record.unit} />
                  </Text>
                  {line.is_non_fefo && <Text size="xs" c="dimmed">非 FEFO：{line.reason}</Text>}
                </Stack>)}
                {reversed && <Text size="xs" c="dimmed">
                  {time(reversed.occurred_at)} 由 {reversed.operator_name} 沖銷：{reversed.reason}
                </Text>}
              </Stack></Table.Td>
              <Table.Td><Text size="sm">{record.operator_name}</Text></Table.Td>
              {/* 欄寬貼齊按鈕，標題與「沖銷」「已沖銷」都置中，上下才對得齊。 */}
              <Table.Td ta="center">
                {reversed
                  ? <Badge color="gray" variant="outline" className={motion.reveal}>已沖銷</Badge>
                  : <Button variant="default" size="sm" h={44} className={motion.press}
                    aria-label={`沖銷 ${time(record.occurred_at)} 的${record.ingredient_name}領用`}
                    onClick={() => setReversing(record)}>沖銷</Button>}
              </Table.Td>
            </Table.Tr>;
          })}
        </DataTable>)}
    </Stack>
    {reversing && <ReverseIssue record={reversing} onClose={() => setReversing(null)} />}
  </Paper>;
}
