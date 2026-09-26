import { TradeList } from '../../components/portfolio';
import { Card, ErrorBox, H1, Loading } from '../../components/ui';
import type { Trade } from '../../lib/types';
import { useApi } from '../../lib/useApi';

export function Activity() {
  const { data, error, loading, reload } = useApi<Trade[]>('/me/trades');
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  return (
    <>
      <H1 sub="Every buy and sell you’ve made, with the NAV used and the reason you gave. These can’t be edited or deleted — that’s what makes them worth looking back on.">
        My decisions
      </H1>
      <Card>
        <TradeList trades={data!} />
      </Card>
    </>
  );
}
