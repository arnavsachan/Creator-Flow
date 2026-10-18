import type { EnvelopeResponse } from './dataStates';

export interface KpiMetric {
  title: string;
  value: string;
  change?: string;
  trend: 'up' | 'down' | 'neutral';
  changePeriod: string;
  sparklinePoints: number[];
}

export interface DashboardMetrics {
  totalViews: KpiMetric;
  netSubscribers: KpiMetric;
  watchTime: KpiMetric;
  estimatedRevenue: KpiMetric;
}

export interface PerformanceChartPoint {
  date: string;
  views: number;
  watchTime: number;
  subscribers: number;
}

export interface ActionableInsight {
  id: string;
  type: string;
  title: string;
  badge: string;
  description: string;
  action_label: string;
  action_href: string;
}

export interface RecentVideoItem {
  id: string;
  title: string;
  published: string;
  views: string;
  avd: string;
  ctr: string;
  ctrStatus: 'high' | 'normal' | 'low';
}

export interface PipelineItem {
  title: string;
  format: 'Long-form' | 'Short';
  stage: 'Idea' | 'Scripting' | 'Editing' | 'Ready';
  scheduledDate: string;
}

export interface DashboardOverviewData {
  channel_id: string;
  metrics: DashboardMetrics;
  chart_data: PerformanceChartPoint[];
  insights: ActionableInsight[];
  recent_videos: RecentVideoItem[];
  pipeline_items: PipelineItem[];
}

export type DashboardOverviewResponse = EnvelopeResponse<DashboardOverviewData>;
