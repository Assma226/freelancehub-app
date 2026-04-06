import { CategoryDto, FreelancerProfileDto } from './api.dto';

export function categorySymbol(category?: Pick<CategoryDto, 'slug' | 'name'> | null): string {
  const source = `${category?.slug || ''} ${category?.name || ''}`.toLowerCase();
  if (source.includes('design')) return 'D';
  if (source.includes('marketing')) return 'M';
  if (source.includes('music') || source.includes('audio')) return 'A';
  if (source.includes('photo')) return 'P';
  if (source.includes('program') || source.includes('tech') || source.includes('dev')) return '</>';
  if (source.includes('video') || source.includes('animation')) return 'V';
  if (source.includes('ai')) return 'AI';
  if (source.includes('write') || source.includes('content') || source.includes('redaction')) return 'W';
  return '[]';
}

export function matchesCategoryForFreelancer(
  freelancer: FreelancerProfileDto,
  categorySlug: string,
  categoryName: string,
): boolean {
  const haystack = [
    freelancer.name || '',
    freelancer.title || '',
    freelancer.bio || '',
    ...(freelancer.skills || []),
  ].join(' ').toLowerCase();

  const normalizedSlug = categorySlug.toLowerCase().replace(/-/g, ' ');
  const normalizedName = categoryName.toLowerCase();

  return haystack.includes(normalizedSlug) || haystack.includes(normalizedName);
}
