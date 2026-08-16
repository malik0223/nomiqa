import type { BranchSummary, DepartmentNode, DirectoryEntry, Paginated } from '@nomiqa/contracts';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { ApiError } from '../../../lib/api-client';
import { auth0 } from '../../../lib/auth0';
import { activeOrganizationId } from '../../../lib/cards';
import { fetchBranches, fetchDepartments, fetchDirectory } from '../../../lib/team';

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}

const CONTROL =
  'rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950';

/**
 * دليل الموظفين (§9.2).
 *
 * ما يظهر هنا **أقل** مما تعرفه المؤسسة عن موظفها عمداً: اسم ومسمى
 * ووحدة ورابط بطاقة. لا بريد ولا هاتف — من أراد بيانات التواصل يفتح
 * البطاقة، وهي المكان الذي قرر صاحبها ما يظهر فيه.
 *
 * التصفية في الرابط لا في حالة المكوّن: «كل موظفي فرع صحار» رابط
 * يُشارَك ويُحفظ في المفضلة.
 */
export default async function DirectoryPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const query = await searchParams;
  const t = await getTranslations();

  const session = await auth0.getSession();
  if (!session) {
    redirect(`/${locale}`);
  }

  let entries: Paginated<DirectoryEntry>;
  let departments: DepartmentNode[];
  let branches: BranchSummary[];

  try {
    const organizationId = await activeOrganizationId();

    [entries, departments, branches] = await Promise.all([
      fetchDirectory(organizationId, {
        q: query.q,
        departmentId: query.departmentId,
        branchId: query.branchId,
        page: query.page ?? 1,
      }),
      fetchDepartments(organizationId),
      fetchBranches(organizationId),
    ]);
  } catch (error) {
    const message = error instanceof ApiError ? error.message : t('errors.generic');

    return (
      <main className="mx-auto max-w-4xl px-6 py-16">
        <h1 className="text-2xl font-bold">{t('directory.title')}</h1>
        <p className="mt-4 text-neutral-600 dark:text-neutral-400">{message}</p>
      </main>
    );
  }

  const flat = flatten(departments);

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-2xl font-bold">{t('directory.title')}</h1>

      <form method="get" className="mt-6 flex flex-wrap items-end gap-2">
        <input
          type="search"
          name="q"
          defaultValue={query.q ?? ''}
          placeholder={t('directory.search')}
          aria-label={t('directory.search')}
          className={`${CONTROL} min-w-48 flex-1`}
        />

        <select
          name="departmentId"
          defaultValue={query.departmentId ?? ''}
          aria-label={t('team.department')}
          className={CONTROL}
        >
          <option value="">{t('directory.allDepartments')}</option>
          {flat.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </select>

        <select
          name="branchId"
          defaultValue={query.branchId ?? ''}
          aria-label={t('team.branch')}
          className={CONTROL}
        >
          <option value="">{t('directory.allBranches')}</option>
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </select>

        <button
          type="submit"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white"
        >
          {t('common.apply')}
        </button>
      </form>

      {entries.data.length === 0 ? (
        <p className="mt-8 text-sm text-neutral-500">{t('directory.empty')}</p>
      ) : (
        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {entries.data.map((entry) => (
            <li
              key={entry.membershipId}
              className="rounded-xl border border-neutral-200 px-4 py-3 dark:border-neutral-800"
            >
              <p className="font-medium">{entry.fullName ?? '—'}</p>
              {entry.jobTitle ? (
                <p className="text-sm text-neutral-600 dark:text-neutral-400">{entry.jobTitle}</p>
              ) : null}
              <p className="mt-1 text-xs text-neutral-500">
                {[entry.departmentName, entry.branchName].filter(Boolean).join(' · ') || '—'}
              </p>
              {entry.cardSlug ? (
                <a
                  href={`/${entry.cardSlug}`}
                  className="mt-2 inline-block text-xs text-brand-600 hover:underline"
                >
                  {t('directory.viewCard')}
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {entries.meta.totalPages > 1 ? (
        <nav className="mt-6 flex items-center gap-3 text-sm">
          {entries.meta.page > 1 ? (
            <a href={`?page=${entries.meta.page - 1}`} className="text-brand-600 hover:underline">
              ‹
            </a>
          ) : null}
          <span className="text-neutral-500">
            {entries.meta.page} / {entries.meta.totalPages}
          </span>
          {entries.meta.page < entries.meta.totalPages ? (
            <a href={`?page=${entries.meta.page + 1}`} className="text-brand-600 hover:underline">
              ›
            </a>
          ) : null}
        </nav>
      ) : null}
    </main>
  );
}

function flatten(nodes: DepartmentNode[]): Array<{ id: string; name: string }> {
  return nodes.flatMap((node) => [{ id: node.id, name: node.name }, ...flatten(node.children)]);
}
