import type { EnvelopeResponse } from './dataStates';

export interface KpiMetric {
  title: string;
  value: number;
  formattedValue: string;
  change?: number | null;
  formattedChange?: string | null;
  trend: 'up' | 'down' | 'neutral';
  changePeriod: string;
  sparklinePoints: number[];
}

export interface DashboardKpis {
  totalViews: KpiMetric;
  netSubscribers: KpiMetric;
  watchTimeHours: KpiMetric;
  estimatedPartnerRevenue?: KpiMetric | null;
}

export interface VelocityChartPoint {
  date: string;
  views: number;
  watchTime: number;
  subscribers: number;
  timestamp?: string;
}

export interface ActionableInsight {
  id: string;
  type: string;
  title: string;
  badgeLabel: string;
  description: string;
  actionText: string;
  actionUrl: string;
}

export interface RecentVideoItem {
  id: string;
  title: string;
  published: string;
  views: number;
  formattedViews: string;
  avd: string;
  ctr: string;
  rawCtr?: number | null;
  ctrStatus: 'high' | 'normal' | 'low';
  thumbnailUrl?: string | null;
}

export interface PipelineItem {
  id?: string | null;
  title: string;
  format: 'Long-form' | 'Short';
  stage: 'Idea' | 'Scripting' | 'Editing' | 'Ready';
  scheduledDate: string;
}

export interface DashboardOverviewData {
  channelId: string;
  kpis: DashboardKpis;
  velocityChart: VelocityChartPoint[];
  actionableInsights: ActionableInsight[];
  recentVideos: RecentVideoItem[];
  contentPipeline: PipelineItem[];
}

export type DashboardOverviewResponse = EnvelopeResponse<DashboardOverviewData>;
