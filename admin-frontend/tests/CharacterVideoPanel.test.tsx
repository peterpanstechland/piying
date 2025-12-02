/**
 * CharacterVideoPanel Component Tests
 * 
 * Tests for the character-specific video management panel.
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import CharacterVideoPanel from '../src/components/timeline/CharacterVideoPanel';
import { adminApi } from '../src/services/api';

// Mock the API module
vi.mock('../src/services/api', () => ({
  adminApi: {
    getCharacterVideos: vi.fn(),
    uploadCharacterVideo: vi.fn(),
    deleteCharacterVideo: vi.fn(),
  },
}));

const mockCharacters = [
  {
    character_id: 'char-1',
    character_name: '嫦娥',
    character_thumbnail: 'characters/char-1/thumbnail.png',
    has_video: true,
    video_path: 'storylines/story-1/videos/char-1.mp4',
    video_duration: 30.5,
    video_thumbnail: 'storylines/story-1/videos/char-1_thumb.jpg',
    uploaded_at: '2024-01-15T10:30:00Z',
  },
  {
    character_id: 'char-2',
    character_name: '宇航员',
    character_thumbnail: 'characters/char-2/thumbnail.png',
    has_video: false,
    video_path: null,
    video_duration: null,
    video_thumbnail: null,
    uploaded_at: null,
  },
];

describe('CharacterVideoPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('displays loading state initially', () => {
    vi.mocked(adminApi.getCharacterVideos).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    render(
      <CharacterVideoPanel
        storylineId="story-1"
        baseVideoDuration={30}
      />
    );

    expect(screen.getByText(/加载角色视频配置/)).toBeInTheDocument();
  });

  it('displays empty state when no characters are assigned', async () => {
    vi.mocked(adminApi.getCharacterVideos).mockResolvedValue({
      storyline_id: 'story-1',
      base_video_duration: 30,
      characters: [],
    });

    render(
      <CharacterVideoPanel
        storylineId="story-1"
        baseVideoDuration={30}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/暂无可配置角色/)).toBeInTheDocument();
    });
  });

  it('displays character list with video status (Requirements 4.1, 4.2)', async () => {
    vi.mocked(adminApi.getCharacterVideos).mockResolvedValue({
      storyline_id: 'story-1',
      base_video_duration: 30,
      characters: mockCharacters,
    });

    render(
      <CharacterVideoPanel
        storylineId="story-1"
        baseVideoDuration={30}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('嫦娥')).toBeInTheDocument();
      expect(screen.getByText('宇航员')).toBeInTheDocument();
    });

    // Check video status indicators
    expect(screen.getByText('✓ 已上传')).toBeInTheDocument();
    expect(screen.getByText('○ 未配置')).toBeInTheDocument();
  });


  it('displays video duration and thumbnail for uploaded videos (Requirements 4.4)', async () => {
    vi.mocked(adminApi.getCharacterVideos).mockResolvedValue({
      storyline_id: 'story-1',
      base_video_duration: 30,
      characters: mockCharacters,
    });

    render(
      <CharacterVideoPanel
        storylineId="story-1"
        baseVideoDuration={30}
      />
    );

    await waitFor(() => {
      // Check duration is displayed (00:30 for 30.5 seconds)
      expect(screen.getByText(/⏱ 00:30/)).toBeInTheDocument();
    });
  });

  it('shows upload button for each character (Requirements 4.3)', async () => {
    vi.mocked(adminApi.getCharacterVideos).mockResolvedValue({
      storyline_id: 'story-1',
      base_video_duration: 30,
      characters: mockCharacters,
    });

    render(
      <CharacterVideoPanel
        storylineId="story-1"
        baseVideoDuration={30}
      />
    );

    await waitFor(() => {
      // Character with video shows "更换" button
      expect(screen.getByText('更换')).toBeInTheDocument();
      // Character without video shows "上传" button
      expect(screen.getByText('上传')).toBeInTheDocument();
    });
  });

  it('shows delete button only for characters with videos (Requirements 4.5)', async () => {
    vi.mocked(adminApi.getCharacterVideos).mockResolvedValue({
      storyline_id: 'story-1',
      base_video_duration: 30,
      characters: mockCharacters,
    });

    render(
      <CharacterVideoPanel
        storylineId="story-1"
        baseVideoDuration={30}
      />
    );

    await waitFor(() => {
      // Only one delete button should be present (for the character with video)
      const deleteButtons = screen.getAllByText('删除');
      expect(deleteButtons).toHaveLength(1);
    });
  });

  it('calls delete API when delete button is clicked (Requirements 4.5)', async () => {
    vi.mocked(adminApi.getCharacterVideos).mockResolvedValue({
      storyline_id: 'story-1',
      base_video_duration: 30,
      characters: mockCharacters,
    });
    vi.mocked(adminApi.deleteCharacterVideo).mockResolvedValue({
      message: 'Video deleted successfully',
    });

    const onVideoChange = vi.fn();

    render(
      <CharacterVideoPanel
        storylineId="story-1"
        baseVideoDuration={30}
        onVideoChange={onVideoChange}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('删除')).toBeInTheDocument();
    });

    // Click delete button
    fireEvent.click(screen.getByText('删除'));

    await waitFor(() => {
      expect(adminApi.deleteCharacterVideo).toHaveBeenCalledWith('story-1', 'char-1');
    });
  });

  it('displays base video duration reference', async () => {
    vi.mocked(adminApi.getCharacterVideos).mockResolvedValue({
      storyline_id: 'story-1',
      base_video_duration: 30,
      characters: mockCharacters,
    });

    render(
      <CharacterVideoPanel
        storylineId="story-1"
        baseVideoDuration={30}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('基础视频时长:')).toBeInTheDocument();
      expect(screen.getByText('00:30')).toBeInTheDocument();
    });
  });

  it('displays summary showing configured count', async () => {
    vi.mocked(adminApi.getCharacterVideos).mockResolvedValue({
      storyline_id: 'story-1',
      base_video_duration: 30,
      characters: mockCharacters,
    });

    render(
      <CharacterVideoPanel
        storylineId="story-1"
        baseVideoDuration={30}
      />
    );

    await waitFor(() => {
      // 1 out of 2 characters have videos
      expect(screen.getByText('1/2 已配置')).toBeInTheDocument();
    });
  });

  it('displays error message when API fails after loading characters', async () => {
    // First load succeeds
    vi.mocked(adminApi.getCharacterVideos).mockResolvedValueOnce({
      storyline_id: 'story-1',
      base_video_duration: 30,
      characters: mockCharacters,
    });
    // Delete fails
    vi.mocked(adminApi.deleteCharacterVideo).mockRejectedValue({
      detail: '删除失败',
    });

    render(
      <CharacterVideoPanel
        storylineId="story-1"
        baseVideoDuration={30}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('删除')).toBeInTheDocument();
    });

    // Click delete button to trigger error
    fireEvent.click(screen.getByText('删除'));

    await waitFor(() => {
      expect(screen.getByText('删除失败')).toBeInTheDocument();
    });
  });
});
