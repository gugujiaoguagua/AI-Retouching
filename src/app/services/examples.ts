import type { ImageData } from '@/app/types';

export const exampleImages: ImageData[] = [
  {
    id: 'example-portrait-1',
    url: 'https://images.unsplash.com/photo-1665021758862-8d6f857c40fa?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwb3J0cmFpdCUyMHdvbWFuJTIwbmF0dXJhbCUyMGxpZ2h0fGVufDF8fHx8MTc3MDA1OTA2OXww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
    source: 'example',
    timestamp: Date.now()
  },
  {
    id: 'example-landscape-1',
    url: 'https://images.unsplash.com/photo-1465056836041-7f43ac27dcb5?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxsYW5kc2NhcGUlMjBtb3VudGFpbiUyMHN1bnNldHxlbnwxfHx8fDE3NzAwNDkxNDh8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
    source: 'example',
    timestamp: Date.now()
  },
  {
    id: 'example-pet-1',
    url: 'https://images.unsplash.com/photo-1719292606971-0916fc62f5b0?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxnb2xkZW4lMjByZXRyaWV2ZXIlMjBkb2clMjBoYXBweXxlbnwxfHx8fDE3NzAxMDA4NTV8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
    source: 'example',
    timestamp: Date.now()
  },
  {
    id: 'example-product-1',
    url: 'https://images.unsplash.com/photo-1610219171722-87b3f4170557?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwcm9kdWN0JTIwY29mZmVlJTIwbWluaW1hbHxlbnwxfHx8fDE3NzAxMDA4NTV8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
    source: 'example',
    timestamp: Date.now()
  },
  {
    id: 'example-illustration-1',
    url: 'https://images.unsplash.com/photo-1736175549681-c24c552da1e2?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxhYnN0cmFjdCUyMGNvbG9yZnVsJTIwaWxsdXN0cmF0aW9ufGVufDF8fHx8MTc3MDAyMzI0MHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
    source: 'example',
    timestamp: Date.now()
  },
  {
    id: 'example-portrait-2',
    url: 'https://images.unsplash.com/photo-1672685667592-0392f458f46f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwb3J0cmFpdCUyMG1hbiUyMHByb2Zlc3Npb25hbHxlbnwxfHx8fDE3Njk5OTQwNTR8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
    source: 'example',
    timestamp: Date.now()
  }
];

export const exampleCategories = [
  {
    name: '头像',
    id: 'portrait',
    images: exampleImages.filter(img => img.id.includes('portrait'))
  },
  {
    name: '风景',
    id: 'landscape',
    images: exampleImages.filter(img => img.id.includes('landscape'))
  },
  {
    name: '宠物',
    id: 'pet',
    images: exampleImages.filter(img => img.id.includes('pet'))
  }
];

const examplePromptByCategory: Record<string, string> = {
  portrait:
    '生成头像：自然肤色、柔和光线、背景干净简约、轻微磨皮但保留细节、高清、比例 1:1',
  landscape:
    '生成风景：电影感色调、增强天空层次、提升对比与清晰度、保持自然不过饱和、高清',
  pet:
    '生成宠物：可爱清晰、毛发细节增强、背景轻微虚化、色彩自然、高清',
};

const examplePromptByImageId: Record<string, string> = {
  'example-portrait-1':
    '生成头像：柔和自然光、浅景深、背景干净、轻微磨皮保留皮肤质感、高清、比例 1:1',
  'example-portrait-2':
    '生成头像：商务质感、干净背景、提升清晰度与对比、自然肤色、高清、比例 1:1',
  'example-landscape-1':
    '生成风景：日落氛围、电影感色调、增强云层与光影层次、提升清晰度、高清',
  'example-pet-1':
    '生成宠物：更可爱更清晰、毛发细节增强、背景虚化、色彩自然、高清',
};

export function getExamplePrompt(categoryId: string, imageId: string) {
  return examplePromptByImageId[imageId] ?? examplePromptByCategory[categoryId] ?? '';
}
