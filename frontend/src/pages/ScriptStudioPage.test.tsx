import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModeProvider } from '../context/AppModeContext';
import { ScriptStudioPage } from './ScriptStudioPage';
import * as scriptService from '../services/scriptService';
import * as youtubeService from '../services/youtubeService';
import type {
  GenerateHooksResponse,
  GenerateScriptResponse,
  RetentionAuditResponse,
  SavedScript,
} from '../types/script';

vi.mock('../services/scriptService', () => ({
  generateHooks: vi.fn(),
  generateScript: vi.fn(),
  auditRetention: vi.fn(),
  saveScript: vi.fn(),
  listSavedScripts: vi.fn(),
  getSavedScript: vi.fn(),
}));

vi.mock('../services/youtubeService', async (importOriginal) => {
  const actual = await importOriginal<typeof youtubeService>();
  return {
    ...actual,
    getConnectionStatus: vi.fn().mockResolvedValue({ connected: false }),
  };
});

describe('ScriptStudioPage Component Tests', () => {
  const mockSavedScripts: SavedScript[] = [
    {
      id: 'script-1',
      userId: 'user-1',
      title: 'Architecting Cache Systems',
      topic: 'Caching Strategies',
      targetDuration: '8m 00s',
      tone: 'Authoritative',
      audiencePersona: 'Senior Engineers',
      hookType: 'negative',
      hookText: 'Stop using Redis for every cache problem.',
      fullScript: '[0:00] Stop using Redis for every cache problem...',
      estimatedRetentionScore: 82.5,
      createdAt: '2026-10-20T10:00:00Z',
      updatedAt: '2026-10-20T10:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(scriptService.listSavedScripts).mockResolvedValue(mockSavedScripts);
  });

  const renderComponent = () =>
    render(
      <AppModeProvider initialDataState="DEMO">
        <ScriptStudioPage />
      </AppModeProvider>
    );

  it('renders initial Script Studio layout with editable script text', async () => {
    renderComponent();

    expect(screen.getByText(/Script Studio & Hook Retention Engine/i)).toBeInTheDocument();
    expect(screen.getByText(/Gemini 3.8 Flash/i)).toBeInTheDocument();

    const textarea = screen.getByPlaceholderText(
      /Type or paste your video script with \[timecode\] headers\.\.\./i
    ) as HTMLTextAreaElement;
    expect(textarea).toBeInTheDocument();
    expect(textarea.readOnly).toBe(false);

    // Editing the script text
    fireEvent.change(textarea, { target: { value: 'New custom script draft' } });
    expect(textarea.value).toBe('New custom script draft');
  });

  it('generates hook variations successfully and allows selecting a hook', async () => {
    const mockHooksRes: GenerateHooksResponse = {
      topic: 'Scaling Distributed Queues',
      hooks: [
        {
          archetype: 'negative',
          hookText: 'Most engineers misuse Kafka partitions at scale.',
          estimatedRetentionScore: 84.0,
          rationale: 'Mistake framing',
        },
        {
          archetype: 'curiosity',
          hookText: 'The secret why WhatsApp handles billions of messages with tiny servers.',
          estimatedRetentionScore: 89.5,
          rationale: 'Hidden truth',
        },
      ],
      disclaimer: 'AI estimate',
    };
    vi.mocked(scriptService.generateHooks).mockResolvedValue(mockHooksRes);

    renderComponent();

    const topicInput = screen.getByPlaceholderText(/e\.g\. Scaling SQLite for AI Agents/i);
    fireEvent.change(topicInput, { target: { value: 'Scaling Distributed Queues' } });

    const generateHooksBtn = screen.getByRole('button', { name: /Generate 3 Hook Variations/i });
    fireEvent.click(generateHooksBtn);

    await waitFor(() => {
      expect(scriptService.generateHooks).toHaveBeenCalledWith({
        topic: 'Scaling Distributed Queues',
        audiencePersona: 'Software Engineers & Tech Leads',
        tone: 'Authoritative',
        channelId: 'demo-channel-1',
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/Most engineers misuse Kafka partitions at scale\./i)).toBeInTheDocument();
      expect(
        screen.getByText(/The secret why WhatsApp handles billions of messages with tiny servers\./i)
      ).toBeInTheDocument();
    });
  });

  it('generates full script with Gemini and updates the editor', async () => {
    const mockScriptRes: GenerateScriptResponse = {
      title: 'Distributed Queues Blueprint',
      topic: 'Distributed Queues',
      targetDuration: '8m 00s',
      tone: 'Authoritative',
      hookType: 'negative',
      hookText: 'Most engineers misuse Kafka partitions at scale.',
      fullScript: '[0:00 - 0:05] HOOK:\n"Most engineers misuse Kafka partitions at scale."',
      estimatedRetentionScore: 83.5,
      disclaimer: 'AI estimate',
    };
    const mockAuditRes: RetentionAuditResponse = {
      estimatedRetentionScore: 83.5,
      retentionTier: 'Top 5%',
      wordCount: 15,
      estimatedDurationSeconds: 10,
      formattedDuration: '0m 10s',
      pacingWpm: 145,
      hookDetected: true,
      first30sAnalysis: 'Strong opening hook.',
      strengths: ['High-urgency hook in the opening window.'],
      dropOffRisks: [],
      pacingRecommendations: [],
      disclaimer: 'AI estimate',
    };

    vi.mocked(scriptService.generateScript).mockResolvedValue(mockScriptRes);
    vi.mocked(scriptService.auditRetention).mockResolvedValue(mockAuditRes);

    renderComponent();

    const generateScriptBtn = screen.getByRole('button', { name: /Generate Full Script/i });
    fireEvent.click(generateScriptBtn);

    await waitFor(() => {
      expect(scriptService.generateScript).toHaveBeenCalled();
    });

    await waitFor(() => {
      const textarea = screen.getByPlaceholderText(
        /Type or paste your video script with \[timecode\] headers\.\.\./i
      ) as HTMLTextAreaElement;
      expect(textarea.value).toContain('Most engineers misuse Kafka partitions at scale.');
    });
  });

  it('handles generation API errors gracefully with an error banner', async () => {
    vi.mocked(scriptService.generateHooks).mockRejectedValue(
      new Error('Gemini API key is not configured.')
    );

    renderComponent();

    const generateHooksBtn = screen.getByRole('button', { name: /Generate 3 Hook Variations/i });
    fireEvent.click(generateHooksBtn);

    await waitFor(() => {
      expect(screen.getByText(/Gemini API key is not configured\./i)).toBeInTheDocument();
    });
  });

  it('saves script and loads saved script from library drawer', async () => {
    const newSaved: SavedScript = {
      id: 'script-2',
      userId: 'user-1',
      title: 'PostgreSQL Indexing Deep Dive',
      topic: 'Indexing',
      targetDuration: '8m 00s',
      tone: 'Authoritative',
      hookType: 'curiosity',
      fullScript: '[0:00] The hidden truth about B-tree indexes...',
      estimatedRetentionScore: 78.0,
      createdAt: '2026-10-22T10:00:00Z',
      updatedAt: '2026-10-22T10:00:00Z',
    };
    vi.mocked(scriptService.saveScript).mockResolvedValue(newSaved);

    renderComponent();

    // Click Save Script
    const saveBtn = screen.getByRole('button', { name: /Save Script/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(scriptService.saveScript).toHaveBeenCalled();
      expect(screen.getByText(/Saved!/i)).toBeInTheDocument();
    });

    // Open Saved Scripts Drawer
    const savedDrawerBtn = screen.getByRole('button', { name: /Saved \(/i });
    fireEvent.click(savedDrawerBtn);

    await waitFor(() => {
      expect(screen.getByText(/Saved Scripts Library/i)).toBeInTheDocument();
      expect(screen.getByText(/Architecting Cache Systems/i)).toBeInTheDocument();
    });

    // Click on saved script card to load it
    fireEvent.click(screen.getByText(/Architecting Cache Systems/i));

    await waitFor(() => {
      const textarea = screen.getByPlaceholderText(
        /Type or paste your video script with \[timecode\] headers\.\.\./i
      ) as HTMLTextAreaElement;
      expect(textarea.value).toContain('Stop using Redis for every cache problem');
    });
  });

  it('opens teleprompter modal and allows speed adjustment', async () => {
    renderComponent();

    const teleprompterBtn = screen.getByRole('button', { name: /Teleprompter/i });
    fireEvent.click(teleprompterBtn);

    expect(screen.getByTestId('teleprompter-modal-title')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start Scroll/i })).toBeInTheDocument();

    // Toggle scroll
    fireEvent.click(screen.getByRole('button', { name: /Start Scroll/i }));
    expect(screen.getByRole('button', { name: /Pause/i })).toBeInTheDocument();

    // Close teleprompter
    const closeBtn = screen.getByTitle(/Close Teleprompter/i);
    fireEvent.click(closeBtn);
    expect(screen.queryByTestId('teleprompter-modal-title')).not.toBeInTheDocument();
  });

  it('copies script to clipboard with visual confirmation', async () => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });

    renderComponent();

    const copyBtn = screen.getByRole('button', { name: /Copy Script/i });
    fireEvent.click(copyBtn);

    expect(navigator.clipboard.writeText).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText(/Copied/i)).toBeInTheDocument();
    });
  });
});
