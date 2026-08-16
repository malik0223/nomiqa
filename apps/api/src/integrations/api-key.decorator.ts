import { SetMetadata } from '@nestjs/common';
import type { ApiKeyScope } from '@nomiqa/contracts';

export const API_KEY_SCOPE_KEY = 'apiKeyScope';

/**
 * يعلّم مساراً بأنه للـAPI العام بمفتاح (§11.4).
 *
 * وسم واحد يحمل معنيين معاً — «الهوية مفتاح لا مستخدم» و«النطاق
 * المطلوب» — عمداً: فصلهما كان يسمح بمسار معلَّم بالهوية وحدها، أي
 * مسار يفتحه **أي** مفتاح في المؤسسة مهما ضاقت نطاقاته. مفتاح
 * بنطاق القراءة كان سيكتب.
 *
 * الحرّاس الأخرى (Auth0، سياق المؤسسة، الصلاحيات) تتخطى المسار
 * الموسوم به، و`ApiKeyGuard` وحده يقرر — فلا طريق يمر بلا حارس.
 */
export const RequireApiScope = (scope: ApiKeyScope) => SetMetadata(API_KEY_SCOPE_KEY, scope);
