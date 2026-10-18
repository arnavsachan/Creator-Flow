import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KpiCard } from './KpiCard';

describe('KpiCard', () => {
  it('renders "Not available" when value is null and does NOT render $0', () => {
    render(<KpiCard title="Est. Partner Revenue" value={null} />);

    expect(screen.getByText('Est. Partner Revenue')).toBeInTheDocument();
    expect(screen.getByText('Not available')).toBeInTheDocument();
    expect(screen.queryByText('$0')).not.toBeInTheDocument();
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument();
  });

  it('renders "Not available" when value is undefined and does NOT render $0', () => {
    render(<KpiCard title="Est. Partner Revenue" value={undefined} />);

    expect(screen.getByText('Est. Partner Revenue')).toBeInTheDocument();
    expect(screen.getByText('Not available')).toBeInTheDocument();
    expect(screen.queryByText('$0')).not.toBeInTheDocument();
  });

  it('renders formatted value and change when provided', () => {
    render(
      <KpiCard
        title="Total Views"
        value="1,428,900"
        change="+18.4%"
        trend="up"
        sparklinePoints={[10, 20, 30, 40]}
      />
    );

    expect(screen.getByText('Total Views')).toBeInTheDocument();
    expect(screen.getByText('1,428,900')).toBeInTheDocument();
    expect(screen.getByText('+18.4%')).toBeInTheDocument();
  });

  it('safely handles empty sparkline points array without crashing or rendering 28d Trend', () => {
    render(
      <KpiCard
        title="Net Subscribers"
        value="+120"
        sparklinePoints={[]}
      />
    );

    expect(screen.getByText('Net Subscribers')).toBeInTheDocument();
    expect(screen.getByText('+120')).toBeInTheDocument();
    expect(screen.queryByText('28d Trend')).not.toBeInTheDocument();
  });
});
