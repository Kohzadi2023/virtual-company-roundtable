export type TutorialLanguage = 'en' | 'fa' | 'fr' | 'es' | 'ar';

export interface TutorialSection {
  id: string;
  icon: string;
  title: string;
  summary: string;
  paragraphs: string[];
  steps?: string[];
  tips?: string[];
}

export interface TutorialLocale {
  direction: 'ltr' | 'rtl';
  nativeName: string;
  pageTitle: string;
  pageSubtitle: string;
  searchPlaceholder: string;
  contentsLabel: string;
  noResults: string;
  closeLabel: string;
  languageLabel: string;
  guideOnlyNote: string;
  sections: TutorialSection[];
}

export const TUTORIAL_LANGUAGE_OPTIONS: Array<{ value: TutorialLanguage; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'fa', label: 'فارسی' },
  { value: 'fr', label: 'Français' },
  { value: 'es', label: 'Español' },
  { value: 'ar', label: 'العربية' },
];

export function tutorialLanguageFromBrowser(languages: readonly string[] = navigator.languages): TutorialLanguage {
  for (const language of languages) {
    const code = language.toLowerCase().split('-')[0];
    if (code === 'fa' || code === 'fr' || code === 'es' || code === 'ar' || code === 'en') return code;
  }
  return 'en';
}

const en: TutorialLocale = {
  direction: 'ltr',
  nativeName: 'English',
  pageTitle: 'Virtual Company — Complete Guide',
  pageSubtitle: 'A practical walkthrough from your first room to a structured multi-agent meeting, decisions, actions, memory, and secure backups.',
  searchPlaceholder: 'Search this guide…',
  contentsLabel: 'Guide contents',
  noResults: 'No tutorial section matches your search.',
  closeLabel: 'Close guide',
  languageLabel: 'Guide language',
  guideOnlyNote: 'This selector changes the tutorial language only; the main application UI remains unchanged.',
  sections: [
    {
      id: 'overview', icon: '🚀', title: '1. What Virtual Company is',
      summary: 'You direct a company of fixed specialist agents. The app organizes the shared discussion; the external AI chats produce each specialist response.',
      paragraphs: [
        'You are the owner and decision maker. Each Agent is a named virtual employee with a fixed professional role, skills, prompt, avatar, and memory/context state. Rooms are roundtables where User and Agent messages form one chronological record.',
        'Virtual Company does not silently run every specialist for you. You choose who should contribute, copy the right context, use that Agent’s external AI conversation, bring the response back, and then continue the meeting. This keeps the human in control of the discussion and the final decision.',
      ],
      steps: ['Create or select a room.', 'Add a User message that states the problem or objective.', 'Choose the specialist you want to hear from.', 'Copy context, open that specialist’s AI chat, get the answer, and paste it back.', 'Repeat until the meeting reaches a decision and action plan.'],
      tips: ['Use a room per topic, project, or major decision so context stays focused.', 'Treat the timeline as the official shared record of the discussion.'],
    },
    {
      id: 'screen', icon: '🧭', title: '2. Understanding the screen',
      summary: 'The interface is split into company navigation, the shared timeline, room/meeting controls, and the action panel.',
      paragraphs: [
        'The left Company Directory contains specialists and teams. The center is the active room timeline. The top bar contains Workspace, Projects, room settings, full-chat copy, and this Help page. The room toolbars expose meeting orchestration and operational controls. The bottom Action Panel switches between User Message and Agent Response.',
        'The right-side rooms panel helps move between roundtables. The footer exposes memory, operations, traceability, idea merge, settings, and current workspace counts.',
      ],
      tips: ['If the center is empty, create/select a room and send the first User message.', 'Hover or focus agent avatars to inspect role and skills.'],
    },
    {
      id: 'company', icon: '👥', title: '3. Specialists, roles, and teams',
      summary: 'Agents are persistent company members. Roles define their professional boundaries; teams group related specialists.',
      paragraphs: [
        'An Agent should keep the same professional identity across rooms. For example, architecture questions should go to the architect, product scope to the product manager, security concerns to the security specialist, and so on. This separation makes disagreements useful instead of turning every Agent into the same general assistant.',
        'Use the Company Directory to search by name, role, or skill. Teams let you add several specialists to a room together. Room Settings can also add or remove individual specialists. The meeting facilitator is a standing participant used to open, coordinate, synthesize, and close structured rounds.',
      ],
      steps: ['Open the Company Directory.', 'Review the Agent’s role and skills before assigning work.', 'Use teams for recurring cross-functional groups.', 'Use Room Settings when a room needs a different mix of specialists.'],
    },
    {
      id: 'rooms', icon: '🏢', title: '4. Rooms and projects',
      summary: 'A Room is one discussion context. A Project groups work that may span several rooms, decisions, and actions.',
      paragraphs: [
        'Create a new room from Room Settings. You can start with only the facilitator or pre-load a team. Messages, meeting state, and per-Agent context are tracked per room, so one room does not automatically become context for another.',
        'Use Project Center when the work is larger than a single discussion. Projects help keep related rooms, outcomes, and follow-up work organized without mixing unrelated conversations.',
      ],
      steps: ['Open Room Settings → New Room.', 'Name the room after the problem or decision.', 'Optionally choose an initial team.', 'Use Project Center if several rooms belong to the same initiative.'],
      tips: ['Create a fresh room when the objective changes significantly.', 'Do not use one endless room for every company topic.'],
    },
    {
      id: 'meeting', icon: '◉', title: '5. Running a structured meeting',
      summary: 'Meeting Orchestration tracks the objective, phases, rounds, current speaker, response status, readiness, and external chat links.',
      paragraphs: [
        'Open the Meeting panel from the violet Meeting button. A structured meeting moves through phases such as Open, Collect Opinions, Challenge, Resolve, Decision, Actions, and Closed. The system also tracks a round stage: facilitator opening, specialist turns, facilitator synthesis, and round complete.',
        'Set the meeting objective and use the speaker order deliberately. A specialist can be marked responded or skipped. When specialist turns are complete, the facilitator performs synthesis before the next round. Decision and meeting-close readiness checks prevent moving forward while required work is incomplete.',
      ],
      steps: ['Open Meeting and define the objective.', 'Confirm the specialists and speaker order.', 'Let the facilitator open the round.', 'Collect specialist responses in order; skip only when appropriate.', 'Use the synthesis turn to consolidate findings.', 'Continue through challenge/resolve/decision rounds.', 'Capture actions, then close only when readiness blockers are cleared.'],
      tips: ['Use Challenge Consensus when the group is agreeing too quickly.', 'A decision is not final merely because an Agent suggested it; the User remains the approver.'],
    },
    {
      id: 'context', icon: '🧠', title: '6. Context modes — what to copy',
      summary: 'Context is tracked separately for every Agent, so each specialist can receive only what it has not seen or a broader context when needed.',
      paragraphs: [
        'Continue Existing Chat sends only new context since that Agent’s previous successful copy. New Chat re-establishes the discussion for a fresh external conversation. Full Context sends all relevant room messages. Smart Compact summarizes older discussion while preserving important/pinned items and recent messages. Decision Review adds a decision-focused instruction. Challenge Consensus asks the Agent to test assumptions, evidence, alternatives, and failure modes.',
        'Preview / Select shows exactly what will be copied and lets you remove low-value messages before sending. The size estimate helps avoid excessively large prompts.',
      ],
      steps: ['Use Continue Existing Chat for normal ongoing work.', 'Use New Chat when the saved external conversation is replaced.', 'Use Smart Compact for long rooms.', 'Use Decision Review before committing to a consequential choice.', 'Use Challenge Consensus when you want rigorous dissent.', 'Use Preview / Select before copying very large context.'],
    },
    {
      id: 'external', icon: '📋', title: '7. External AI chat: Copy → Open → Paste back',
      summary: 'This is the core operating loop for each specialist and works in both the web app and desktop EXE.',
      paragraphs: [
        'Each Agent can have a saved conversation URL for providers such as ChatGPT, Gemini, Claude, Copilot, DeepSeek, Qwen, Grok, Meta, or another compatible web chat. Saving one conversation per Agent helps preserve that specialist’s continuity.',
        'Copy sends the generated Agent prompt to the system clipboard. Open / Focus launches the saved external chat. After the AI answers, copy only the useful Agent response. Back in Virtual Company, Paste Response reads the clipboard into the Agent Response editor. Nothing is submitted automatically: review or edit the text first, then click Add Response or use Ctrl/Cmd + Enter.',
      ],
      steps: ['Select the correct Agent in Agent Response.', 'Choose the appropriate context mode.', 'Click Copy.', 'Click Open / Focus and paste the prompt into the external AI chat.', 'Send the prompt and wait for the answer.', 'Copy the external answer.', 'Return to Virtual Company and click Paste Response.', 'Review/edit the imported text.', 'Click Add Response to place it on the shared timeline.'],
      tips: ['Always verify that the selected Agent matches the external conversation you are using.', 'Paste Response never auto-submits; this is intentional so you can review the content.'],
    },
    {
      id: 'timeline', icon: '💬', title: '8. Timeline, messages, and full-chat export',
      summary: 'The timeline is the room’s shared source of truth.',
      paragraphs: [
        'Use User Message for your instructions, constraints, decisions, and clarifications. Agent Response is for the specialist’s answer. Messages stay chronological and support mixed-language content and Markdown. Long messages can collapse for readability.',
        'Copy Full Chat exports the room as clean text when you need the complete discussion outside the app. This is different from Agent context copying, which is role-aware and may send only a delta or compacted history.',
      ],
      tips: ['Put final approvals and important constraints into the timeline, not only inside an external AI chat.', 'Use Copy Full Chat for archival/review; use Agent context controls for specialist work.'],
    },
    {
      id: 'workspace', icon: '📁', title: '9. Workspace, memory, operations, traceability, and idea merge',
      summary: 'The footer and Workspace tools turn discussion into durable organizational work.',
      paragraphs: [
        'Memory features preserve reusable context and Agent-specific knowledge. Operations tracks work that should become executable follow-up. Traceability helps connect discussion to outcomes. Idea Merge helps consolidate overlapping ideas instead of keeping duplicate proposals. Workspace Suite provides broader organizational artifacts around the discussion.',
        'Use these features after or during meetings when information becomes durable: decisions, requirements, risks, action items, reusable knowledge, or consolidated proposals.',
      ],
      steps: ['Keep transient brainstorming in the room timeline.', 'Promote durable knowledge to Memory when it should be reused later.', 'Turn commitments into action items instead of leaving them as prose.', 'Use Traceability to preserve why a decision/action exists.', 'Merge duplicate or overlapping ideas before final prioritization.'],
    },
    {
      id: 'security', icon: '🔐', title: '10. Local data, security, and backups',
      summary: 'The application is local-first and provides optional application locking and encrypted workspace backups.',
      paragraphs: [
        'Normal workspace state is stored locally and mirrors to the local FastAPI/SQLite backend when available. Settings can enable a local PIN lock. Encrypted backup export/import is optional and uses a passphrase; it protects the exported backup file, not the normal SQLite database itself.',
        'Treat external AI chats as separate services with their own accounts and privacy policies. Only copy material you are comfortable sending to the selected provider.',
      ],
      steps: ['Open Settings from the footer.', 'Optionally enable App Lock and configure a PIN.', 'Enable encrypted backups if you need portable protected exports.', 'Use a strong backup passphrase and store it safely.', 'Test restore procedures before relying on a backup for critical work.'],
    },
    {
      id: 'shortcuts', icon: '⌨️', title: '11. Useful controls and shortcuts',
      summary: 'A few small habits make the workflow much faster.',
      paragraphs: ['Ctrl + Enter on Windows/Linux or Cmd + Enter on macOS submits the active User or Agent editor. Standard Ctrl/Cmd+C and Ctrl/Cmd+V still work in normal text fields. Paste Response is the explicit clipboard-read shortcut for Agent responses.'],
      tips: ['Use the command palette when you know the action you want but not where it lives.', 'Keep one external conversation per Agent whenever possible.', 'Use Preview / Select to trim large context instead of manually rebuilding prompts.'],
    },
    {
      id: 'troubleshooting', icon: '🛠️', title: '12. Troubleshooting',
      summary: 'Most issues fall into room selection, clipboard/browser permissions, stale desktop processes, or oversized context.',
      paragraphs: [
        'If Open / Focus works on the web but not in the desktop app, update to the latest desktop build because the EXE uses a native system-browser command. If clipboard reading fails in a browser, use Ctrl/Cmd+V manually; browser permission policies can block programmatic reads. Desktop uses native clipboard support.',
        'If a local Tauri build reports Access is denied while replacing the backend sidecar, close stale Virtual Company processes and rerun the desktop helper script. If context becomes too large, switch to Smart Compact or remove low-value messages in Preview / Select.',
      ],
      tips: ['Before reporting a problem, note whether it occurs in Web, Desktop EXE, or both.', 'Keep your local branch updated before testing a recently merged fix.'],
    },
  ],
};

const fa: TutorialLocale = {
  direction: 'rtl', nativeName: 'فارسی',
  pageTitle: 'راهنمای کامل Virtual Company',
  pageSubtitle: 'آموزش عملی از ساخت اولین اتاق تا جلسه چندایجنتی، تصمیم، اکشن، حافظه و بکاپ امن.',
  searchPlaceholder: 'جست‌وجو در راهنما…', contentsLabel: 'فهرست آموزش', noResults: 'بخشی مطابق جست‌وجوی شما پیدا نشد.', closeLabel: 'بستن راهنما', languageLabel: 'زبان راهنما', guideOnlyNote: 'این انتخاب فقط زبان صفحه آموزش را عوض می‌کند و زبان رابط اصلی برنامه را تغییر نمی‌دهد.',
  sections: [
    { id: 'overview', icon: '🚀', title: '۱. Virtual Company چیست؟', summary: 'شما مدیر یک شرکت مجازی با متخصصان ثابت هستید؛ برنامه گفتگو را مدیریت می‌کند و پاسخ تخصصی هر Agent از چت AI خارجی می‌آید.', paragraphs: ['شما Owner و تصمیم‌گیرنده نهایی هستید. هر Agent یک کارمند مجازی با نقش حرفه‌ای، مهارت، پرامپت، آواتار و وضعیت context مشخص است. Room همان میزگرد کاری است و پیام‌های User و Agent در یک Timeline مشترک ثبت می‌شوند.', 'برنامه به‌صورت پنهانی همه Agentها را اجرا نمی‌کند. شما مشخص می‌کنید چه کسی صحبت کند، چه Contextی دریافت کند، پاسخ را از چت خارجی همان Agent می‌گیرید و بعد آن را وارد جلسه می‌کنید. به این ترتیب کنترل روند و تصمیم نهایی دست شما می‌ماند.'], steps: ['یک Room بسازید یا انتخاب کنید.', 'در User Message مسئله، هدف و محدودیت‌ها را بنویسید.', 'Agent مناسب را انتخاب کنید.', 'Context را Copy کنید، چت خارجی را باز کنید و پاسخ را بگیرید.', 'پاسخ را Paste و پس از بررسی Add Response کنید.', 'این چرخه را تا تصمیم و Action Plan ادامه دهید.'], tips: ['برای هر موضوع یا تصمیم مهم یک Room جدا داشته باشید.', 'Timeline را سابقه رسمی بحث در نظر بگیرید.'] },
    { id: 'screen', icon: '🧭', title: '۲. اجزای صفحه', summary: 'صفحه از Company Directory، Timeline مرکزی، ابزارهای Room/Meeting و Action Panel تشکیل شده است.', paragraphs: ['سمت چپ Company Directory شامل Agentها و Teamهاست. مرکز صفحه Timeline اتاق فعال است. Top Bar شامل Workspace، Projects، Room Settings، Copy Full Chat و Help است. نوارهای بالای Timeline ابزارهای Room و Meeting را نشان می‌دهند. پایین صفحه Action Panel بین User Message و Agent Response جابه‌جا می‌شود.', 'پنل سمت راست برای حرکت بین Roomهاست. Footer نیز Memory، Operations، Traceability، Idea Merge، Settings و آمار Workspace را در دسترس قرار می‌دهد.'], tips: ['اگر مرکز صفحه خالی است یک Room بسازید/انتخاب کنید و اولین User Message را بفرستید.', 'با Hover یا Focus روی آواتار، Role و Skills را ببینید.'] },
    { id: 'company', icon: '👥', title: '۳. Agent، Role و Team', summary: 'هر Agent هویت حرفه‌ای ثابت دارد و Teamها چند تخصص مرتبط را کنار هم قرار می‌دهند.', paragraphs: ['Agent باید در Roomهای مختلف هویت حرفه‌ای خودش را حفظ کند؛ معماری برای Architect، Scope محصول برای Product Manager، امنیت برای Security Specialist و الی آخر. این جداسازی باعث می‌شود اختلاف نظرها مفید باشند و همه Agentها به یک دستیار عمومی تبدیل نشوند.', 'در Company Directory می‌توانید بر اساس نام، Role یا Skill جست‌وجو کنید. Team برای اضافه‌کردن چند متخصص به یک Room مناسب است. در Room Settings می‌توانید Team یا فرد را اضافه/حذف کنید. Facilitator عضو ثابت جلسه ساختاریافته است و Opening، هماهنگی، Synthesis و Closing را مدیریت می‌کند.'], steps: ['Company Directory را باز کنید.', 'قبل از واگذاری کار Role و Skills را ببینید.', 'برای گروه‌های تکراری از Team استفاده کنید.', 'ترکیب هر Room را از Room Settings تنظیم کنید.'] },
    { id: 'rooms', icon: '🏢', title: '۴. Room و Project', summary: 'Room یک Context مستقل برای بحث است؛ Project چند Room و خروجی مرتبط را زیر یک ابتکار نگه می‌دارد.', paragraphs: ['از Room Settings یک Room جدید بسازید. می‌توانید فقط با Facilitator شروع کنید یا یک Team را از ابتدا اضافه کنید. پیام‌ها، وضعیت Meeting و Context هر Agent به‌صورت مستقل برای هر Room نگه‌داری می‌شوند.', 'اگر کار بزرگ‌تر از یک گفتگوست، از Project Center استفاده کنید تا چند Room، تصمیم و پیگیری مرتبط از هم جدا ولی زیر یک پروژه باقی بمانند.'], steps: ['Room Settings → New Room.', 'نام Room را بر اساس مسئله/تصمیم انتخاب کنید.', 'در صورت نیاز Team اولیه را انتخاب کنید.', 'برای ابتکارهای چندمرحله‌ای Project بسازید.'], tips: ['با تغییر جدی هدف، Room جدید بسازید.', 'یک Room بی‌نهایت برای همه موضوعات شرکت نسازید.'] },
    { id: 'meeting', icon: '◉', title: '۵. اجرای Meeting ساختاریافته', summary: 'Meeting Orchestration هدف، Phase، Round، Speaker، وضعیت پاسخ و Readiness را مدیریت می‌کند.', paragraphs: ['از دکمه بنفش Meeting پنل Orchestration را باز کنید. جریان جلسه شامل Phaseهایی مثل Open، Collect Opinions، Challenge، Resolve، Decision، Actions و Closed است. هر Round نیز Opening Facilitator، نوبت Specialists، Synthesis Facilitator و Complete دارد.', 'Objective را مشخص کنید و Speaker Order را آگاهانه بچینید. هر Specialist می‌تواند Responded یا Skipped شود. پس از تکمیل نوبت متخصصان، Facilitator جمع‌بندی می‌کند. Readiness blockerها مانع رفتن زودهنگام به Decision یا Close می‌شوند.'], steps: ['Meeting را باز و Objective را تعیین کنید.', 'متخصصان و ترتیب صحبت را کنترل کنید.', 'Facilitator Round را باز کند.', 'پاسخ Specialistها را به ترتیب جمع کنید.', 'Synthesis را انجام دهید.', 'از Challenge/Resolve به Decision بروید.', 'Actionها را ثبت و بعد جلسه را Close کنید.'], tips: ['وقتی توافق خیلی سریع شکل گرفته از Challenge Consensus استفاده کنید.', 'پیشنهاد Agent به‌تنهایی تصمیم نهایی نیست؛ تأیید با User است.'] },
    { id: 'context', icon: '🧠', title: '۶. Context Modes', summary: 'Context برای هر Agent جدا دنبال می‌شود؛ بنابراین می‌توانید فقط پیام‌های جدید یا Context گسترده‌تر را ارسال کنید.', paragraphs: ['Continue Existing Chat فقط Context جدید از آخرین Copy موفق همان Agent را می‌فرستد. New Chat برای شروع یک گفتگوی خارجی تازه، Context لازم را دوباره برقرار می‌کند. Full Context همه پیام‌های مرتبط را می‌فرستد. Smart Compact بخش قدیمی را خلاصه و پیام‌های مهم/Pin‌شده و جدید را کامل نگه می‌دارد. Decision Review برای بررسی تصمیم و Challenge Consensus برای نقد فرض‌ها و اجماع است.', 'Preview / Select دقیقاً چیزی را که Copy می‌شود نشان می‌دهد و اجازه حذف پیام‌های کم‌ارزش را می‌دهد. شمارش تقریبی Token به کنترل اندازه Prompt کمک می‌کند.'], steps: ['برای کار معمول Continue Existing Chat.', 'برای چت خارجی جدید New Chat.', 'برای Room طولانی Smart Compact.', 'پیش از تصمیم مهم Decision Review.', 'برای تست اجماع Challenge Consensus.', 'برای Prompt بزرگ Preview / Select.'] },
    { id: 'external', icon: '📋', title: '۷. چرخه اصلی: Copy → Open → Paste Response', summary: 'این چرخه اصلی کار هر Agent است و در Web و EXE اجرا می‌شود.', paragraphs: ['برای هر Agent می‌توانید URL چت خارجی ذخیره کنید؛ مثل ChatGPT، Gemini، Claude، Copilot، DeepSeek، Qwen، Grok یا سرویس دیگر. بهتر است هر Agent چت خودش را داشته باشد تا تداوم تخصصی حفظ شود.', 'Copy پرامپت تولیدشده را وارد System Clipboard می‌کند. Open / Focus چت ذخیره‌شده را باز می‌کند. بعد از دریافت جواب، پاسخ مفید را Copy کنید. در Virtual Company روی Paste Response بزنید تا متن وارد Agent Response شود. هیچ Submit خودکاری انجام نمی‌شود؛ متن را بررسی/ویرایش کنید و بعد Add Response یا Ctrl/Cmd + Enter را بزنید.'], steps: ['Agent صحیح را در Agent Response انتخاب کنید.', 'Context Mode مناسب را انتخاب کنید.', 'Copy را بزنید.', 'Open / Focus را بزنید و Prompt را در AI خارجی Paste کنید.', 'جواب را بگیرید و Copy کنید.', 'به برنامه برگردید و Paste Response را بزنید.', 'جواب را بررسی کنید.', 'Add Response را بزنید.'], tips: ['قبل از ارسال مطمئن شوید Agent انتخابی با چت خارجی یکی است.', 'Paste Response عمداً Auto-submit نمی‌کند.'] },
    { id: 'timeline', icon: '💬', title: '۸. Timeline و Copy Full Chat', summary: 'Timeline منبع مشترک حقیقت هر Room است.', paragraphs: ['User Message برای دستور، محدودیت، تصمیم و توضیح شماست. Agent Response برای پاسخ متخصص است. پیام‌ها به ترتیب زمانی ثبت می‌شوند و محتوای فارسی/انگلیسی و Markdown را پشتیبانی می‌کنند.', 'Copy Full Chat کل گفتگو را به متن تمیز تبدیل می‌کند. این با Agent Context فرق دارد؛ Agent Context نقش‌محور است و ممکن است فقط Delta یا نسخه Compact را بفرستد.'], tips: ['تصمیم نهایی و محدودیت مهم را در Timeline هم ثبت کنید، نه فقط در چت خارجی.', 'برای کار Agent از Context Controls و برای آرشیو/مرور از Copy Full Chat استفاده کنید.'] },
    { id: 'workspace', icon: '📁', title: '۹. Workspace، Memory، Operations و Traceability', summary: 'این ابزارها گفتگو را به دانش و کار پایدار تبدیل می‌کنند.', paragraphs: ['Memory برای Context قابل‌استفاده مجدد و حافظه Agentهاست. Operations برای کارهای اجرایی و پیگیری است. Traceability رابطه بین بحث و خروجی را حفظ می‌کند. Idea Merge ایده‌های مشابه را ادغام می‌کند. Workspace Suite نیز Artifactهای سازمانی گسترده‌تر را مدیریت می‌کند.', 'وقتی چیزی از Brainstorming موقت به تصمیم، Requirement، Risk، Action یا Knowledge پایدار تبدیل شد، آن را از Timeline به ابزار مناسب ارتقا دهید.'], steps: ['Brainstorming موقت در Timeline بماند.', 'دانش ماندگار را به Memory ببرید.', 'تعهدها را Action Item کنید.', 'برای چرایی تصمیم از Traceability استفاده کنید.', 'ایده‌های تکراری را Merge کنید.'] },
    { id: 'security', icon: '🔐', title: '۱۰. داده محلی، امنیت و Backup', summary: 'برنامه Local-first است و App Lock و Backup رمزگذاری‌شده اختیاری دارد.', paragraphs: ['Workspace به‌صورت محلی ذخیره می‌شود و در صورت در دسترس بودن Backend محلی با FastAPI/SQLite Mirror می‌شود. در Settings می‌توانید PIN محلی فعال کنید. Backup رمزگذاری‌شده با Passphrase محافظت می‌شود؛ این قابلیت فایل Backup را رمز می‌کند و به معنی رمزگذاری خود SQLite اصلی نیست.', 'چت‌های AI خارجی سرویس‌های جدا با حساب و سیاست حریم خصوصی خودشان هستند. فقط اطلاعاتی را Copy کنید که ارسال آن به Provider انتخابی برای شما قابل‌قبول است.'], steps: ['Footer → Settings.', 'در صورت نیاز App Lock و PIN را فعال کنید.', 'برای Export امن Encrypted Backup را فعال کنید.', 'Passphrase قوی را امن نگه دارید.', 'Restore را قبل از اتکای جدی به Backup تست کنید.'] },
    { id: 'shortcuts', icon: '⌨️', title: '۱۱. Shortcutها و عادت‌های سریع', summary: 'چند کنترل ساده سرعت کار را زیاد می‌کند.', paragraphs: ['Ctrl + Enter در Windows/Linux یا Cmd + Enter در macOS متن فعال User/Agent را Submit می‌کند. Ctrl/Cmd+C و Ctrl/Cmd+V معمولی در فیلدها کار می‌کند. Paste Response مسیر صریح برای خواندن Clipboard و واردکردن پاسخ Agent است.'], tips: ['برای پیدا کردن سریع Actionها از Command Palette استفاده کنید.', 'تا حد ممکن برای هر Agent یک چت خارجی ثابت نگه دارید.', 'برای Context بزرگ به‌جای بازسازی دستی Prompt از Smart Compact و Preview استفاده کنید.'] },
    { id: 'troubleshooting', icon: '🛠️', title: '۱۲. رفع اشکال', summary: 'مشکلات رایج معمولاً مربوط به Clipboard/Browser، Process قدیمی Desktop یا Context بزرگ هستند.', paragraphs: ['اگر Open / Focus در Web کار می‌کند ولی در EXE نه، Desktop را به آخرین Build آپدیت کنید؛ نسخه جدید از فرمان Native برای مرورگر سیستم استفاده می‌کند. اگر Clipboard Read در Browser Block شد، Ctrl/Cmd+V را دستی بزنید؛ سیاست Permission مرورگر ممکن است خواندن برنامه‌ای را ببندد. Desktop از Clipboard بومی استفاده می‌کند.', 'اگر Tauri هنگام جایگزینی Sidecar خطای Access is denied داد، Processهای قدیمی Virtual Company را ببندید و run-desktop.ps1 را دوباره اجرا کنید. برای Context خیلی بزرگ Smart Compact یا Preview / Select را به کار ببرید.'], tips: ['هنگام گزارش مشکل مشخص کنید Web است، EXE است یا هر دو.', 'قبل از تست Fix جدید، Branch محلی را با main به‌روز کنید.'] },
  ],
};

const fr: TutorialLocale = {
  direction: 'ltr', nativeName: 'Français', pageTitle: 'Virtual Company — Guide complet', pageSubtitle: 'De la première salle à la réunion multi-agents, aux décisions, actions, mémoires et sauvegardes.', searchPlaceholder: 'Rechercher dans le guide…', contentsLabel: 'Sommaire', noResults: 'Aucune section ne correspond à votre recherche.', closeLabel: 'Fermer le guide', languageLabel: 'Langue du guide', guideOnlyNote: 'Ce sélecteur modifie uniquement la langue du guide, pas l’interface principale.',
  sections: [
    { id:'overview', icon:'🚀', title:'1. Comprendre Virtual Company', summary:'Vous dirigez une entreprise virtuelle composée de spécialistes aux rôles fixes.', paragraphs:['Vous êtes le propriétaire et le décideur final. Chaque Agent possède un rôle professionnel, des compétences, un prompt et un état de contexte propres. Une Room est une table ronde dont la Timeline conserve les messages User et Agent.', 'Vous choisissez quel spécialiste intervient, copiez son contexte, utilisez sa conversation IA externe puis réintégrez la réponse. Le contrôle humain reste central.'], steps:['Créer ou sélectionner une Room.','Décrire le problème dans User Message.','Choisir le spécialiste.','Copier le contexte, ouvrir son chat externe et obtenir la réponse.','Coller la réponse, la vérifier puis Add Response.'] },
    { id:'screen', icon:'🧭', title:'2. Lire l’interface', summary:'Annuaire à gauche, Timeline au centre, outils de Room/Meeting en haut, Action Panel en bas.', paragraphs:['La barre supérieure donne accès à Workspace, Projects, Room Settings, Copy Full Chat et Help. Le pied de page donne accès à Memory, Operations, Traceability, Idea Merge et Settings.'], tips:['Survolez les avatars pour voir le rôle et les compétences.'] },
    { id:'company', icon:'👥', title:'3. Agents, rôles et équipes', summary:'Les rôles restent stables afin que chaque spécialiste conserve une perspective distincte.', paragraphs:['Recherchez les Agents par nom, rôle ou compétence. Les Teams ajoutent plusieurs spécialistes ensemble. Room Settings permet d’ajouter ou retirer des individus. Le Facilitator coordonne les réunions structurées.'] },
    { id:'rooms', icon:'🏢', title:'4. Rooms et Projects', summary:'Une Room isole un contexte de discussion; un Project regroupe plusieurs discussions et livrables liés.', paragraphs:['Créez une Room depuis Room Settings et choisissez éventuellement une équipe initiale. Utilisez Project Center pour un travail couvrant plusieurs Rooms.'] },
    { id:'meeting', icon:'◉', title:'5. Réunion structurée', summary:'Meeting Orchestration suit objectif, phases, rounds, intervenant actif, statuts et readiness.', paragraphs:['Les phases incluent Open, Collect Opinions, Challenge, Resolve, Decision, Actions et Closed. Chaque round passe par ouverture du Facilitator, interventions des spécialistes, synthèse puis completion.'], steps:['Définir l’objectif.','Vérifier les participants et l’ordre.','Collecter les réponses.','Faire la synthèse.','Passer par Challenge/Resolve/Decision.','Créer les actions puis fermer la réunion lorsque les blockers sont levés.'] },
    { id:'context', icon:'🧠', title:'6. Modes de contexte', summary:'Chaque Agent possède son propre curseur de contexte.', paragraphs:['Continue Existing Chat envoie uniquement les nouveautés. New Chat reconstruit le contexte. Full Context envoie tout le contexte pertinent. Smart Compact résume l’ancien contenu et conserve les éléments importants/récents. Decision Review prépare une revue de décision; Challenge Consensus teste les hypothèses.'], tips:['Utilisez Preview / Select pour contrôler exactement ce qui sera copié.'] },
    { id:'external', icon:'📋', title:'7. Boucle Copy → Open → Paste Response', summary:'Le flux principal entre Virtual Company et ChatGPT, Gemini, Claude, DeepSeek ou un autre fournisseur.', paragraphs:['Sélectionnez l’Agent, copiez le contexte, ouvrez son chat externe, envoyez le prompt, copiez la réponse puis utilisez Paste Response. Relisez le texte avant Add Response; aucun envoi automatique n’est effectué.'], steps:['Sélectionner l’Agent.','Choisir le mode de contexte.','Copy.','Open / Focus.','Coller et envoyer le prompt externe.','Copier la réponse.','Paste Response.','Réviser puis Add Response.'] },
    { id:'timeline', icon:'💬', title:'8. Timeline et Copy Full Chat', summary:'La Timeline est l’historique partagé de la Room.', paragraphs:['User Message contient vos instructions et décisions; Agent Response contient la contribution du spécialiste. Copy Full Chat exporte toute la conversation, contrairement au contexte Agent qui peut être différentiel ou compact.'] },
    { id:'workspace', icon:'📁', title:'9. Memory, Operations, Traceability et Idea Merge', summary:'Transformez la conversation en connaissance et suivi durables.', paragraphs:['Utilisez Memory pour l’information réutilisable, Operations pour les engagements exécutables, Traceability pour relier discussion et résultats, et Idea Merge pour consolider les propositions qui se recouvrent.'] },
    { id:'security', icon:'🔐', title:'10. Sécurité et sauvegardes', summary:'Le produit est local-first avec verrouillage et sauvegardes chiffrées optionnels.', paragraphs:['Settings permet un PIN local et des exports protégés par passphrase. Les chats IA externes restent des services distincts: n’y envoyez que les informations appropriées.'] },
    { id:'shortcuts', icon:'⌨️', title:'11. Raccourcis utiles', summary:'Ctrl+Enter (ou Cmd+Enter) soumet l’éditeur actif.', paragraphs:['Les raccourcis copier/coller standards fonctionnent dans les champs. Paste Response offre une lecture explicite du presse-papiers pour les réponses Agent.'] },
    { id:'troubleshooting', icon:'🛠️', title:'12. Dépannage', summary:'Identifiez d’abord si le problème concerne Web, Desktop EXE ou les deux.', paragraphs:['En cas de blocage du presse-papiers Web, utilisez Ctrl/Cmd+V. Pour un contexte trop grand, utilisez Smart Compact. Pour un build Tauri avec Access is denied, fermez les anciens processus Virtual Company puis relancez le script desktop.'] },
  ],
};

const es: TutorialLocale = {
  direction:'ltr', nativeName:'Español', pageTitle:'Virtual Company — Guía completa', pageSubtitle:'Desde la primera sala hasta reuniones multiagente, decisiones, acciones, memoria y copias de seguridad.', searchPlaceholder:'Buscar en la guía…', contentsLabel:'Contenido', noResults:'No hay secciones que coincidan con la búsqueda.', closeLabel:'Cerrar guía', languageLabel:'Idioma de la guía', guideOnlyNote:'Este selector cambia solo el idioma de la guía, no la interfaz principal.',
  sections:[
    { id:'overview', icon:'🚀', title:'1. Qué es Virtual Company', summary:'Tú diriges una empresa virtual de especialistas con roles fijos.', paragraphs:['Eres la persona propietaria y quien toma la decisión final. Cada Agent mantiene un rol, habilidades, prompt y contexto propios. Una Room es una mesa de trabajo con una Timeline compartida.', 'Tú decides quién participa, qué contexto recibe, utilizas su chat de IA externo y devuelves la respuesta a la sala.'], steps:['Crear o seleccionar una Room.','Escribir el objetivo en User Message.','Elegir el especialista.','Copiar contexto, abrir su chat externo y obtener respuesta.','Pegar, revisar y usar Add Response.'] },
    { id:'screen', icon:'🧭', title:'2. Cómo leer la pantalla', summary:'Directorio a la izquierda, Timeline en el centro, controles arriba y Action Panel abajo.', paragraphs:['La barra superior ofrece Workspace, Projects, Room Settings, Copy Full Chat y Help. El pie incluye Memory, Operations, Traceability, Idea Merge y Settings.'] },
    { id:'company', icon:'👥', title:'3. Agents, roles y equipos', summary:'Los roles permanecen estables para conservar perspectivas profesionales distintas.', paragraphs:['Busca por nombre, rol o habilidad. Usa Teams para añadir varios especialistas a una Room y Room Settings para ajustar personas individuales. El Facilitator coordina reuniones estructuradas.'] },
    { id:'rooms', icon:'🏢', title:'4. Rooms y Projects', summary:'Una Room separa un contexto; un Project agrupa trabajo relacionado.', paragraphs:['Crea salas desde Room Settings y, si quieres, empieza con un Team. Usa Project Center cuando una iniciativa necesite varias salas.'] },
    { id:'meeting', icon:'◉', title:'5. Reunión estructurada', summary:'Meeting Orchestration controla objetivo, fases, rondas, turnos, estado y readiness.', paragraphs:['Las fases incluyen Open, Collect Opinions, Challenge, Resolve, Decision, Actions y Closed. Cada ronda pasa por apertura del Facilitator, especialistas, síntesis y finalización.'], steps:['Definir objetivo.','Confirmar especialistas y orden.','Recoger respuestas.','Hacer síntesis.','Avanzar por Challenge/Resolve/Decision.','Crear acciones y cerrar cuando no haya blockers.'] },
    { id:'context', icon:'🧠', title:'6. Modos de contexto', summary:'Cada Agent tiene su propio punto de sincronización.', paragraphs:['Continue Existing Chat envía solo lo nuevo. New Chat reconstruye el contexto. Full Context envía todo lo relevante. Smart Compact resume lo antiguo y conserva lo importante/reciente. Decision Review orienta a decisión y Challenge Consensus busca debilidades y alternativas.'] },
    { id:'external', icon:'📋', title:'7. Flujo Copy → Open → Paste Response', summary:'El ciclo principal con ChatGPT, Gemini, Claude, DeepSeek u otros.', paragraphs:['Selecciona el Agent, copia el contexto, abre su chat externo, envía el prompt, copia la respuesta y usa Paste Response. Revisa antes de Add Response; nunca se envía automáticamente.'], steps:['Seleccionar Agent.','Elegir modo.','Copy.','Open / Focus.','Pegar y enviar fuera.','Copiar respuesta.','Paste Response.','Revisar y Add Response.'] },
    { id:'timeline', icon:'💬', title:'8. Timeline y Copy Full Chat', summary:'La Timeline es el registro compartido de la Room.', paragraphs:['User Message contiene tus instrucciones/decisiones y Agent Response la contribución del especialista. Copy Full Chat exporta toda la sala; el contexto por Agent puede ser incremental o compacto.'] },
    { id:'workspace', icon:'📁', title:'9. Memory, Operations, Traceability e Idea Merge', summary:'Convierte conversación en conocimiento y trabajo persistentes.', paragraphs:['Usa Memory para conocimiento reutilizable, Operations para compromisos ejecutables, Traceability para conectar discusión y resultado, e Idea Merge para consolidar propuestas similares.'] },
    { id:'security', icon:'🔐', title:'10. Seguridad y backups', summary:'El sistema es local-first con PIN y backups cifrados opcionales.', paragraphs:['Settings permite App Lock y exportaciones protegidas con passphrase. Los chats externos tienen sus propias políticas; comparte solo información apropiada.'] },
    { id:'shortcuts', icon:'⌨️', title:'11. Atajos', summary:'Ctrl+Enter o Cmd+Enter envía el editor activo.', paragraphs:['Copiar/pegar estándar funciona normalmente. Paste Response lee el portapapeles explícitamente para respuestas de Agent.'] },
    { id:'troubleshooting', icon:'🛠️', title:'12. Solución de problemas', summary:'Primero identifica si ocurre en Web, EXE o ambos.', paragraphs:['Si el navegador bloquea lectura del portapapeles, usa Ctrl/Cmd+V. Si el contexto es enorme, usa Smart Compact. Si Tauri muestra Access is denied, cierra procesos antiguos de Virtual Company y vuelve a ejecutar el script desktop.'] },
  ],
};

const ar: TutorialLocale = {
  direction:'rtl', nativeName:'العربية', pageTitle:'الدليل الكامل لـ Virtual Company', pageSubtitle:'من إنشاء أول غرفة إلى الاجتماعات متعددة الوكلاء والقرارات والمهام والذاكرة والنسخ الاحتياطية.', searchPlaceholder:'ابحث في الدليل…', contentsLabel:'محتويات الدليل', noResults:'لا يوجد قسم يطابق البحث.', closeLabel:'إغلاق الدليل', languageLabel:'لغة الدليل', guideOnlyNote:'هذا الخيار يغيّر لغة صفحة التعليم فقط ولا يغيّر واجهة التطبيق الرئيسية.',
  sections:[
    { id:'overview', icon:'🚀', title:'1. ما هو Virtual Company؟', summary:'أنت تدير شركة افتراضية من متخصصين ذوي أدوار ثابتة.', paragraphs:['أنت المالك وصاحب القرار النهائي. لكل Agent دور ومهارات وPrompt وحالة Context خاصة به. الغرفة Room هي طاولة نقاش مشتركة وتُسجَّل رسائل المستخدم والوكلاء في Timeline واحدة.', 'أنت من يحدد المتخصص التالي، وينسخ السياق المناسب، ويستخدم محادثة الذكاء الاصطناعي الخارجية الخاصة به ثم يعيد الإجابة إلى الغرفة.'], steps:['أنشئ أو اختر Room.','اكتب الهدف في User Message.','اختر المتخصص.','انسخ السياق وافتح المحادثة الخارجية واحصل على الإجابة.','ألصق الإجابة وراجعها ثم Add Response.'] },
    { id:'screen', icon:'🧭', title:'2. فهم الشاشة', summary:'دليل الشركة يساراً، Timeline في الوسط، أدوات الغرفة والاجتماع في الأعلى، وAction Panel في الأسفل.', paragraphs:['الشريط العلوي يحتوي Workspace وProjects وRoom Settings وCopy Full Chat وHelp. التذييل يحتوي Memory وOperations وTraceability وIdea Merge وSettings.'] },
    { id:'company', icon:'👥', title:'3. الوكلاء والأدوار والفرق', summary:'يبقى دور كل Agent ثابتاً للحفاظ على منظور مهني مختلف.', paragraphs:['ابحث بالاسم أو الدور أو المهارة. استخدم Teams لإضافة عدة متخصصين معاً، وRoom Settings لتعديل الأفراد. يقوم Facilitator بتنظيم الاجتماع المنهجي.'] },
    { id:'rooms', icon:'🏢', title:'4. الغرف والمشاريع', summary:'كل Room سياق مستقل، بينما Project يجمع العمل المرتبط عبر عدة غرف.', paragraphs:['أنشئ غرفة من Room Settings ويمكنك اختيار Team أولي. استخدم Project Center للمبادرات التي تحتاج أكثر من غرفة.'] },
    { id:'meeting', icon:'◉', title:'5. إدارة اجتماع منظم', summary:'Meeting Orchestration يتابع الهدف والمراحل والجولات والمتحدث والحالة والاستعداد.', paragraphs:['المراحل تشمل Open وCollect Opinions وChallenge وResolve وDecision وActions وClosed. كل جولة تمر بافتتاح Facilitator ثم المتخصصين ثم Synthesis ثم الإكمال.'], steps:['حدد الهدف.','راجع المشاركين وترتيب الكلام.','اجمع ردود المتخصصين.','نفذ Synthesis.','انتقل عبر Challenge/Resolve/Decision.','أنشئ Actions ثم أغلق الاجتماع بعد إزالة blockers.'] },
    { id:'context', icon:'🧠', title:'6. أوضاع السياق', summary:'لكل Agent نقطة مزامنة مستقلة.', paragraphs:['Continue Existing Chat يرسل الجديد فقط. New Chat يعيد بناء السياق. Full Context يرسل كل الرسائل ذات الصلة. Smart Compact يلخص القديم ويحافظ على العناصر المهمة والحديثة. Decision Review يركز على القرار وChallenge Consensus يختبر الافتراضات والبدائل.'] },
    { id:'external', icon:'📋', title:'7. دورة Copy → Open → Paste Response', summary:'هذه هي دورة العمل الأساسية مع ChatGPT وGemini وClaude وDeepSeek وغيرها.', paragraphs:['اختر Agent، انسخ السياق، افتح محادثته الخارجية، أرسل الـPrompt، انسخ الإجابة ثم استخدم Paste Response. راجع النص قبل Add Response؛ لا يوجد إرسال تلقائي.'], steps:['اختر Agent.','اختر Context Mode.','Copy.','Open / Focus.','الصق وأرسل في خدمة الذكاء الاصطناعي.','انسخ الإجابة.','Paste Response.','راجع ثم Add Response.'] },
    { id:'timeline', icon:'💬', title:'8. Timeline وCopy Full Chat', summary:'Timeline هي السجل المشترك الرسمي للغرفة.', paragraphs:['User Message لتعليماتك وقراراتك، وAgent Response لمساهمة المتخصص. Copy Full Chat يصدّر المحادثة كاملة، بينما Context الخاص بالـAgent قد يكون تدريجياً أو مضغوطاً.'] },
    { id:'workspace', icon:'📁', title:'9. Memory وOperations وTraceability وIdea Merge', summary:'حوّل النقاش إلى معرفة وعمل دائمين.', paragraphs:['استخدم Memory للمعرفة القابلة لإعادة الاستخدام، Operations للالتزامات التنفيذية، Traceability لربط النقاش بالنتيجة، وIdea Merge لدمج الأفكار المتشابهة.'] },
    { id:'security', icon:'🔐', title:'10. الأمان والنسخ الاحتياطية', summary:'التطبيق Local-first مع PIN ونسخ احتياطية مشفرة اختيارياً.', paragraphs:['Settings يسمح بـApp Lock ونسخ احتياطية محمية بعبارة مرور. خدمات الذكاء الاصطناعي الخارجية مستقلة ولها سياسات خصوصية خاصة بها.'] },
    { id:'shortcuts', icon:'⌨️', title:'11. اختصارات مفيدة', summary:'Ctrl+Enter أو Cmd+Enter يرسل المحرر النشط.', paragraphs:['اختصارات النسخ واللصق العادية تعمل في الحقول. Paste Response يقرأ Clipboard بشكل صريح لردود Agent.'] },
    { id:'troubleshooting', icon:'🛠️', title:'12. استكشاف الأخطاء', summary:'حدد أولاً هل المشكلة في Web أو EXE أو كليهما.', paragraphs:['إذا منع المتصفح قراءة Clipboard فاستخدم Ctrl/Cmd+V يدوياً. إذا كان Context كبيراً استخدم Smart Compact. إذا ظهر Access is denied في Tauri فأغلق عمليات Virtual Company القديمة ثم أعد تشغيل سكربت Desktop.'] },
  ],
};

export const TUTORIAL_LOCALES: Record<TutorialLanguage, TutorialLocale> = { en, fa, fr, es, ar };
