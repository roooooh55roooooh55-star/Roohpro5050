
// تم تعطيل الأنظمة القديمة.
// النظام يعمل الآن حصرياً على R2 و Firebase.
export const supabase = null;

export const incrementViewsInDB = async (id: string) => {
  // يتم التعامل مع المشاهدات عبر Firebase مباشرة
  // console.log('View incremented for:', id);
};

export const updateLikesInDB = async (id: string, inc: boolean) => {
  // يتم التعامل مع الإعجابات عبر Firebase مباشرة
  // console.log('Like updated for:', id, inc);
};
