import { CategoryDto, FreelancerProfileDto, ProjectDocumentDto } from './api.dto';

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

function normalizeCategoryValue(value?: string | null): string {
  return (value || '')
    .toLowerCase()
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

export function resolveProjectCategorySlug(
  project: Pick<ProjectDocumentDto, 'category' | 'category_name' | 'category_slug'>,
  categories: Pick<CategoryDto, 'slug' | 'name'>[],
): string | null {
  const directSlug = project.category_slug || project.category;
  if (directSlug && categories.some(category => category.slug === directSlug)) {
    return directSlug;
  }

  const candidates = [
    normalizeCategoryValue(project.category_slug),
    normalizeCategoryValue(project.category),
    normalizeCategoryValue(project.category_name),
  ].filter(Boolean);

  if (!candidates.length) return null;

  const matchedCategory = categories.find(category => {
    const normalizedSlug = normalizeCategoryValue(category.slug);
    const normalizedName = normalizeCategoryValue(category.name);

    return candidates.some(candidate => candidate === normalizedSlug || candidate === normalizedName);
  });

  return matchedCategory?.slug || null;
}
