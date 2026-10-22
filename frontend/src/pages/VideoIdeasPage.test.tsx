import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppModeProvider } from '../context/AppModeContext';
import { VideoIdeasPage } from './VideoIdeasPage';
import * as videoIdeaService from '../services/videoIdeaService';
import * as youtubeService from '../services/youtubeService';
import type {
  GenerateIdeasResponse,
  GenerateSeoResponse,
  SavedIdea,
} from '../types/videoIdea';

// Mock clipboard
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn().mockResolvedValue(undefined),
  },
});

vi.mock('../services/videoIdeaService', () => ({
  generateVideoIdeas: vi.fn(),
  generateSeoKit: vi.fn(),
  saveVideoIdea: vi.fn(),
  listSavedIdeas: vi.fn(),
  getSavedIdea: vi.fn(),
  updateSavedIdea: vi.fn(),
  deleteSavedIdea: vi.fn(),
}));

vi.mock('../services/youtubeService', async (importOriginal) => {
  const actual = await importOriginal<typeof youtubeService>();
  return {
    ...actual,
    getConnectionStatus: vi.fn().mockResolvedValue({ connected: false }),
    ensureAuthenticatedSession: vi.fn().mockResolvedValue('mock-token'),
  };
});

describe('VideoIdeasPage Component Tests', () => {
  const mockIdeasResponse: GenerateIdeasResponse = {
    topic: 'SQLite for AI Agents',
    ideas: [
      {
        title: 'Why SQLite is Replacing Vector Databases in 2026',
        summary: 'Deep dive into local SQLite performance versus cloud vector databases.',
        targetAudience: 'Software Engineers',
        hook: 'Almost every AI engineer is making this exact database mistake.',
        primaryKeyword: 'SQLite for AI',
        relatedKeywords: ['vector embeddings', 'agent memory', 'sqlite-vss'],
        contentFormat: 'long_form',
        callToAction: 'Check out the benchmark repository below.',
        angle: 'Counter-intuitive architectural breakdown',
        estimatedScore: 94.5,
        scoreExplanation: 'High technical curiosity with immediate relevance.',
      },
    ],
    disclaimer: 'AI-generated heuristic suggestions.',
  };

  const mockSeoResponse: GenerateSeoResponse = {
    title: 'Why SQLite is Replacing Vector Databases in 2026',
    titleVariations: [
      {
        title: 'Why Senior Devs Are Moving From Pinecone to SQLite',
        style: 'contrarian',
        rationale: 'Directly addresses cost and simplicity.',
      },
      {
        title: 'How to Store 1M Vector Embeddings in SQLite for Free',
        style: 'how-to',
        rationale: 'High practical utility for search.',
      },
    ],
    description: 'Learn why SQLite is the modern choice for local AI agent memory.\n\nTimestamps:\n0:00 - Intro',
    tags: ['sqlite', 'ai agents', 'vector db', 'python'],
    hashtags: ['#sqlite', '#ai', '#programming'],
    primaryKeyword: 'SQLite AI',
    secondaryKeywords: ['embedded databases', 'local llm'],
    thumbnailTextSuggestions: ['SQLITE WINS?', 'VECTOR KILLER'],
    estimatedSeoScore: 91.0,
    scoreExplanation: 'Strong keyword placement in title and early description lines.',
    optimizationRationale: 'Targets both technical search and recommendation feeds.',
    disclaimer: 'Estimated heuristic score.',
  };

  const mockSavedIdeas: SavedIdea[] = [
    {
      id: 'idea-1',
      userId: 'user-1',
      channelId: null,
      title: 'Local LLMs on Apple Silicon in 2026',
      summary: 'Hands-on shootout benchmark.',
      topic: 'Apple Silicon AI',
      niche: 'Hardware & Tech',
      targetAudience: 'Devs',
      language: 'English',
      platform: 'YouTube',
      contentFormat: 'long_form',
      hook: 'Can your laptop actually run 70B parameter models without melting?',
      primaryKeyword: 'Local LLMs Mac',
      relatedKeywords: ['M3 Max', 'Ollama', 'VRAM'],
      callToAction: 'Subscribe for the benchmarks.',
      estimatedScore: 91.0,
      angle: 'Hardware shootout',
      isFavorite: true,
      status: 'active',
      createdAt: '2026-10-22T10:00:00Z',
      updatedAt: '2026-10-22T10:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(videoIdeaService.listSavedIdeas).mockResolvedValue(mockSavedIdeas);
  });

  const renderComponent = () =>
    render(
      <AppModeProvider initialDataState="DEMO">
        <MemoryRouter initialEntries={['/video-ideas']}>
          <Routes>
            <Route path="/video-ideas" element={<VideoIdeasPage />} />
            <Route path="/script-generator" element={<div data-testid="script-studio-screen">Script Studio Screen</div>} />
          </Routes>
        </MemoryRouter>
      </AppModeProvider>
    );

  it('renders initial Video Ideas page layout with tabs and form controls', async () => {
    renderComponent();

    expect(screen.getByText(/Video Ideas & SEO Opportunity Lab/i)).toBeInTheDocument();
    expect(screen.getByText(/Idea Generator/i)).toBeInTheDocument();
    expect(screen.getByText(/SEO Assistant/i)).toBeInTheDocument();
    expect(screen.getByText(/Saved Ideas/i)).toBeInTheDocument();

    expect(
      screen.getByPlaceholderText(/Enter a creator niche or seed topic/i)
    ).toBeInTheDocument();
  });

  it('validates minimum topic length before submitting', async () => {
    renderComponent();

    const generateBtn = screen.getByRole('button', { name: /Generate Concepts/i });
    fireEvent.click(generateBtn);

    expect(
      screen.getByText(/Please enter a topic or seed keyword \(at least 2 characters\)/i)
    ).toBeInTheDocument();
    expect(videoIdeaService.generateVideoIdeas).not.toHaveBeenCalled();
  });

  it('generates concepts and renders idea card with heuristic score and keywords', async () => {
    vi.mocked(videoIdeaService.generateVideoIdeas).mockResolvedValue(mockIdeasResponse);
    renderComponent();

    const input = screen.getByPlaceholderText(/Enter a creator niche or seed topic/i);
    fireEvent.change(input, { target: { value: 'SQLite for AI Agents' } });

    const generateBtn = screen.getByRole('button', { name: /Generate Concepts/i });
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(videoIdeaService.generateVideoIdeas).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: 'SQLite for AI Agents',
        })
      );
    });

    expect(
      await screen.findByText('Why SQLite is Replacing Vector Databases in 2026')
    ).toBeInTheDocument();
    expect(screen.getByText(/EST\. APPEAL 94\.5\/100/i)).toBeInTheDocument();
    expect(screen.getByText(/Deep dive into local SQLite performance/i)).toBeInTheDocument();
    expect(
      screen.getByText(/"Almost every AI engineer is making this exact database mistake\."/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Primary: SQLite for AI/i)).toBeInTheDocument();
  });

  it('renders error state when generator fails and allows retry', async () => {
    vi.mocked(videoIdeaService.generateVideoIdeas).mockRejectedValueOnce(
      new Error('Gemini quota temporarily exceeded')
    );
    renderComponent();

    const input = screen.getByPlaceholderText(/Enter a creator niche or seed topic/i);
    fireEvent.change(input, { target: { value: 'Rust Performance' } });

    const generateBtn = screen.getByRole('button', { name: /Generate Concepts/i });
    fireEvent.click(generateBtn);

    expect(
      await screen.findByText(/Gemini quota temporarily exceeded/i)
    ).toBeInTheDocument();

    // Now mock success on retry
    vi.mocked(videoIdeaService.generateVideoIdeas).mockResolvedValueOnce(mockIdeasResponse);
    const retryBtn = screen.getByRole('button', { name: /Retry Connection/i });
    fireEvent.click(retryBtn);

    expect(
      await screen.findByText('Why SQLite is Replacing Vector Databases in 2026')
    ).toBeInTheDocument();
  });

  it('copies hook to clipboard on copy action', async () => {
    vi.mocked(videoIdeaService.generateVideoIdeas).mockResolvedValue(mockIdeasResponse);
    renderComponent();

    const input = screen.getByPlaceholderText(/Enter a creator niche or seed topic/i);
    fireEvent.change(input, { target: { value: 'SQLite for AI Agents' } });
    fireEvent.click(screen.getByRole('button', { name: /Generate Concepts/i }));

    await screen.findByText('Why SQLite is Replacing Vector Databases in 2026');

    const copyBtns = screen.getAllByRole('button', { name: /Copy/i });
    fireEvent.click(copyBtns[0]);

    expect(navigator.clipboard.writeText).toHaveBeenCalled();
  });

  it('saves an idea to the database and shows success confirmation', async () => {
    vi.mocked(videoIdeaService.generateVideoIdeas).mockResolvedValue(mockIdeasResponse);
    vi.mocked(videoIdeaService.saveVideoIdea).mockResolvedValue({
      ...mockSavedIdeas[0],
      title: 'Why SQLite is Replacing Vector Databases in 2026',
    });

    renderComponent();

    const input = screen.getByPlaceholderText(/Enter a creator niche or seed topic/i);
    fireEvent.change(input, { target: { value: 'SQLite for AI Agents' } });
    fireEvent.click(screen.getByRole('button', { name: /Generate Concepts/i }));

    await screen.findByText('Why SQLite is Replacing Vector Databases in 2026');

    const saveBtn = screen.getByRole('button', { name: /Save Idea/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(videoIdeaService.saveVideoIdea).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Why SQLite is Replacing Vector Databases in 2026',
        })
      );
    });

    expect(await screen.findByRole('status')).toHaveTextContent(/Saved "Why SQLite is Replacing Vector D\.\.\."/i);
  });

  it('navigates to Script Studio when clicking Draft in Script Studio', async () => {
    vi.mocked(videoIdeaService.generateVideoIdeas).mockResolvedValue(mockIdeasResponse);
    renderComponent();

    const input = screen.getByPlaceholderText(/Enter a creator niche or seed topic/i);
    fireEvent.change(input, { target: { value: 'SQLite for AI Agents' } });
    fireEvent.click(screen.getByRole('button', { name: /Generate Concepts/i }));

    await screen.findByText('Why SQLite is Replacing Vector Databases in 2026');

    const draftBtn = screen.getByRole('button', { name: /Draft in Script Studio/i });
    fireEvent.click(draftBtn);

    expect(await screen.findByTestId('script-studio-screen')).toBeInTheDocument();
  });

  it('generates SEO Kit with titles, description, tags, and thumbnail suggestions in SEO Assistant tab', async () => {
    vi.mocked(videoIdeaService.generateSeoKit).mockResolvedValue(mockSeoResponse);
    renderComponent();

    // Switch to SEO tab
    const seoTabBtn = screen.getByRole('button', { name: /SEO Assistant/i });
    fireEvent.click(seoTabBtn);

    const titleInput = screen.getByPlaceholderText(/e\.g\. Why SQLite is the Best Database/i);
    fireEvent.change(titleInput, { target: { value: 'Why SQLite is Replacing Vector Databases in 2026' } });

    const genSeoBtn = screen.getByRole('button', { name: /Generate SEO Kit/i });
    fireEvent.click(genSeoBtn);

    await waitFor(() => {
      expect(videoIdeaService.generateSeoKit).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Why SQLite is Replacing Vector Databases in 2026',
        })
      );
    });

    expect(await screen.findByText(/SEO HEURISTIC SCORE: 91\/100/i)).toBeInTheDocument();
    expect(screen.getByText('Why Senior Devs Are Moving From Pinecone to SQLite')).toBeInTheDocument();
    expect(screen.getByText(/"SQLITE WINS\?"/i)).toBeInTheDocument();
    expect(screen.getByText(/#sqlite/i)).toBeInTheDocument();
  });

  it('displays saved ideas, toggles favorites, and handles deletion in Saved Ideas tab', async () => {
    vi.mocked(videoIdeaService.updateSavedIdea).mockResolvedValue({
      ...mockSavedIdeas[0],
      isFavorite: false,
    });
    vi.mocked(videoIdeaService.deleteSavedIdea).mockResolvedValue(undefined);

    renderComponent();

    // Switch to Saved Ideas tab
    const savedTabBtn = screen.getByRole('button', { name: /Saved Ideas/i });
    fireEvent.click(savedTabBtn);

    expect(
      await screen.findByText('Local LLMs on Apple Silicon in 2026')
    ).toBeInTheDocument();
    expect(screen.getByText(/SCORE: 91\/100/i)).toBeInTheDocument();

    // Toggle favorite
    const favoriteBtn = screen.getByTitle('Unfavorite');
    fireEvent.click(favoriteBtn);
    await waitFor(() => {
      expect(videoIdeaService.updateSavedIdea).toHaveBeenCalledWith('idea-1', {
        isFavorite: false,
      });
    });

    // Delete saved idea
    const deleteBtn = screen.getByTitle('Delete saved idea');
    fireEvent.click(deleteBtn);
    await waitFor(() => {
      expect(videoIdeaService.deleteSavedIdea).toHaveBeenCalledWith('idea-1');
    });
  });

  it('renders audience returned for each individual idea across different niches (e.g. cooking vs tech)', async () => {
    const cookingIdeasResponse: GenerateIdeasResponse = {
      topic: 'Sourdough Bread',
      ideas: [
        {
          title: 'Foolproof No-Knead Sourdough',
          summary: 'A simple beginner technique with standard oven.',
          targetAudience: 'Beginner Home Bakers & Fermentation Enthusiasts',
          hook: 'You do not need a Dutch oven to bake great bread.',
          primaryKeyword: 'Sourdough for Beginners',
          relatedKeywords: ['no-knead', 'starter', 'baking'],
          contentFormat: 'long_form',
          callToAction: 'Get the free recipe schedule below.',
          angle: 'Approachable tutorial',
          estimatedScore: 93.0,
          scoreExplanation: 'High beginner appeal.',
        },
        {
          title: 'Mastering 85% Hydration Dough',
          summary: 'Advanced techniques for open crumb.',
          targetAudience: 'Experienced Micro-Bakery Owners',
          hook: 'High hydration dough does not have to turn into soup.',
          primaryKeyword: 'High Hydration Sourdough',
          relatedKeywords: ['open crumb', 'fermentation', 'tartine'],
          contentFormat: 'long_form',
          callToAction: 'Check out the crumb breakdown.',
          angle: 'Advanced masterclass',
          estimatedScore: 91.0,
          scoreExplanation: 'Deep technical appeal for experts.',
        },
      ],
      disclaimer: 'AI heuristic suggestions.',
    };

    vi.mocked(videoIdeaService.generateVideoIdeas).mockResolvedValue(cookingIdeasResponse);
    renderComponent();

    const input = screen.getByPlaceholderText(/Enter a creator niche or seed topic/i);
    fireEvent.change(input, { target: { value: 'Sourdough Bread' } });
    fireEvent.click(screen.getByRole('button', { name: /Generate Concepts/i }));

    await waitFor(() => {
      expect(videoIdeaService.generateVideoIdeas).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: 'Sourdough Bread',
        })
      );
    });

    // Check each individual idea's audience is rendered
    expect(await screen.findByText('Beginner Home Bakers & Fermentation Enthusiasts')).toBeInTheDocument();
    expect(screen.getByText('Experienced Micro-Bakery Owners')).toBeInTheDocument();
    // Ensure software engineers default is not rendered
    expect(screen.queryByText(/Software Engineers/i)).not.toBeInTheDocument();
  });

  it('preserves explicitly supplied target audience in request payload when set in filters', async () => {
    vi.mocked(videoIdeaService.generateVideoIdeas).mockResolvedValue(mockIdeasResponse);
    renderComponent();

    // Toggle filters panel open
    const filtersBtn = screen.getByRole('button', { name: /Filters/i });
    fireEvent.click(filtersBtn);

    const topicInput = screen.getByPlaceholderText(/Enter a creator niche or seed topic/i);
    fireEvent.change(topicInput, { target: { value: 'Budget Meal Prep' } });

    const audienceInput = screen.getByPlaceholderText(/e\.g\. Home Cooks, Beginners/i);
    fireEvent.change(audienceInput, { target: { value: 'College Students on a Budget' } });

    const nicheInput = screen.getByPlaceholderText(/e\.g\. Cooking, Fitness, Tech/i);
    fireEvent.change(nicheInput, { target: { value: 'Culinary & Meal Prep' } });

    fireEvent.click(screen.getByRole('button', { name: /Generate Concepts/i }));

    await waitFor(() => {
      expect(videoIdeaService.generateVideoIdeas).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: 'Budget Meal Prep',
          targetAudience: 'College Students on a Budget',
          niche: 'Culinary & Meal Prep',
        })
      );
    });
  });

  it('passes undefined for blank filters so audience is dynamically inferred on backend', async () => {
    vi.mocked(videoIdeaService.generateVideoIdeas).mockResolvedValue(mockIdeasResponse);
    renderComponent();

    const topicInput = screen.getByPlaceholderText(/Enter a creator niche or seed topic/i);
    fireEvent.change(topicInput, { target: { value: 'Marathon Training Tips' } });

    fireEvent.click(screen.getByRole('button', { name: /Generate Concepts/i }));

    await waitFor(() => {
      expect(videoIdeaService.generateVideoIdeas).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: 'Marathon Training Tips',
          targetAudience: undefined,
          niche: undefined,
          tone: undefined,
          contentGoals: undefined,
        })
      );
    });
  });
});
