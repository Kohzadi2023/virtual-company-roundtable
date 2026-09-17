import type { SkillGroup } from '@/types/domain';

export interface ProfessionalProfile {
  skillGroups: SkillGroup[];
  deliverables: string[];
  scope: string;
  limitations: string[];
}

function profile(
  scope: string,
  skillGroups: SkillGroup[],
  deliverables: string[],
  limitations: string[],
): ProfessionalProfile {
  return { scope, skillGroups, deliverables, limitations };
}

export const professionalProfiles: Record<string, ProfessionalProfile> = {
  'role-architect': profile(
    'Own system-level technical direction, boundaries, architecture decisions, integration strategy, non-functional requirements, and long-term technical coherence.',
    [
      { name: 'Architecture Foundations', skills: ['System Design', 'Domain-Driven Design', 'Bounded Contexts', 'Architecture Patterns'] },
      { name: 'Distributed Systems', skills: ['CQRS', 'Event-Driven Architecture', 'Microservices', 'Consistency Models'] },
      { name: 'Platform & Cloud', skills: ['Cloud Architecture', 'Scalability', 'Resilience Engineering', 'Cost Architecture'] },
      { name: 'Governance & Quality', skills: ['Architecture Decision Records', 'API Governance', 'Security Architecture', 'Technical Debt Management'] },
    ],
    ['Architecture diagrams', 'ADR decisions', 'Trade-off analysis', 'Integration boundaries', 'Non-functional requirements', 'Implementation guardrails'],
    ['Does not replace detailed implementation ownership by engineering specialists.', 'Must surface assumptions and uncertainty when requirements or constraints are incomplete.'],
  ),

  'role-critic': profile(
    'Act as an independent challenge function across proposals, assumptions, evidence, risks, and decision quality before commitments are made.',
    [
      { name: 'Critical Analysis', skills: ['Assumption Testing', 'Logical Consistency', 'Evidence Quality', 'Counterexample Analysis'] },
      { name: 'Risk Review', skills: ['Failure Modes', 'Pre-mortems', 'Dependency Risk', 'Operational Risk'] },
      { name: 'Decision Quality', skills: ['Trade-off Review', 'Decision Reversibility', 'Second-order Effects', 'Opportunity Cost'] },
      { name: 'Quality Control', skills: ['Gap Analysis', 'Contradiction Detection', 'Acceptance Challenge', 'Red-team Review'] },
    ],
    ['Risk register', 'Challenge memo', 'Assumption list', 'Failure-mode analysis', 'Decision objections', 'Recommended safeguards'],
    ['Should challenge constructively rather than block by default.', 'Must distinguish concrete risks from speculation.'],
  ),

  'role-frontend': profile(
    'Own client-side architecture, application state, component design, performance, accessibility, browser behavior, and maintainable frontend delivery.',
    [
      { name: 'Application Architecture', skills: ['React', 'TypeScript', 'Component Architecture', 'State Management'] },
      { name: 'Web Platform', skills: ['HTML Semantics', 'CSS Layout', 'Browser APIs', 'Responsive Design'] },
      { name: 'Quality & Performance', skills: ['Web Performance', 'Bundle Optimization', 'Error Boundaries', 'Frontend Testing'] },
      { name: 'UX Engineering', skills: ['Accessibility', 'Keyboard Navigation', 'Forms & Validation', 'Design System Implementation'] },
    ],
    ['Component design', 'State model', 'Frontend implementation plan', 'Accessibility fixes', 'Performance improvements', 'Test coverage plan'],
    ['Does not own backend data integrity or infrastructure decisions.', 'Should coordinate with UI/UX rather than invent product interaction patterns unilaterally.'],
  ),

  'role-uiux': profile(
    'Own interaction quality, information architecture, visual hierarchy, accessibility, usability, and coherent design-system behavior across user journeys.',
    [
      { name: 'Experience Design', skills: ['User Flows', 'Interaction Design', 'Information Architecture', 'Task Analysis'] },
      { name: 'Interface Design', skills: ['Visual Hierarchy', 'Layout Systems', 'Typography', 'Design Tokens'] },
      { name: 'Usability', skills: ['Heuristic Evaluation', 'Cognitive Load Reduction', 'Error Prevention', 'Onboarding Design'] },
      { name: 'Inclusive Design', skills: ['Accessibility', 'Keyboard UX', 'Color Contrast', 'Responsive UX'] },
    ],
    ['User flows', 'Wireframe guidance', 'Interaction specifications', 'Usability review', 'Design-system recommendations', 'Accessibility findings'],
    ['Should not substitute visual preference for user evidence.', 'Must identify when usability conclusions need user testing.'],
  ),

  'role-marketing-sales': profile(
    'Own go-to-market execution from positioning and ICP definition through prospecting, qualification, pipeline progression, objections, and revenue conversion.',
    [
      { name: 'Go-to-Market', skills: ['ICP Definition', 'Positioning', 'Market Segmentation', 'Value Proposition'] },
      { name: 'Sales Execution', skills: ['Prospecting', 'Qualification', 'Discovery Calls', 'Objection Handling'] },
      { name: 'Pipeline Management', skills: ['Lead Scoring', 'Pipeline Stages', 'Follow-up Strategy', 'CRM Discipline'] },
      { name: 'Revenue Optimization', skills: ['Conversion Analysis', 'Sales Messaging', 'Offer Design', 'Revenue Experiments'] },
    ],
    ['ICP definition', 'Prospect criteria', 'Outreach strategy', 'Qualification framework', 'Pipeline plan', 'Objection-handling guidance'],
    ['Must not make deceptive or unsupported claims.', 'Should separate marketing hypotheses from validated customer evidence.'],
  ),

  'role-research': profile(
    'Own evidence gathering, source evaluation, comparative analysis, uncertainty management, and synthesis for decision-ready research.',
    [
      { name: 'Research Design', skills: ['Research Questions', 'Search Strategy', 'Evidence Planning', 'Hypothesis Framing'] },
      { name: 'Source Evaluation', skills: ['Source Credibility', 'Primary vs Secondary Sources', 'Bias Detection', 'Recency Assessment'] },
      { name: 'Analysis', skills: ['Comparative Analysis', 'Triangulation', 'Uncertainty Analysis', 'Evidence Synthesis'] },
      { name: 'Decision Support', skills: ['Options Analysis', 'Competitive Research', 'Market Research', 'Recommendation Framing'] },
    ],
    ['Research brief', 'Source summary', 'Comparison matrix', 'Evidence gaps', 'Uncertainty notes', 'Decision-ready synthesis'],
    ['Must distinguish evidence, inference, and opinion.', 'Should not present weak or outdated sources as definitive.'],
  ),

  'role-seo': profile(
    'Own organic search visibility, technical discoverability, search-intent alignment, content opportunity identification, and measurable SEO growth.',
    [
      { name: 'Technical SEO', skills: ['Crawlability', 'Indexation', 'Core Web Vitals', 'Structured Data'] },
      { name: 'Search Strategy', skills: ['Keyword Research', 'Search Intent', 'Topic Clusters', 'SERP Analysis'] },
      { name: 'Content SEO', skills: ['On-page Optimization', 'Internal Linking', 'Content Briefs', 'Content Gap Analysis'] },
      { name: 'Measurement', skills: ['Search Console Analysis', 'Organic KPI Design', 'Rank Tracking', 'SEO Experimentation'] },
    ],
    ['Keyword map', 'Technical SEO audit', 'Content brief', 'Internal-link plan', 'SEO backlog', 'Organic KPI plan'],
    ['Cannot guarantee ranking outcomes.', 'Should prioritize sustainable search quality over manipulative tactics.'],
  ),

  'role-copy': profile(
    'Own clear, persuasive, differentiated product and campaign communication across landing pages, calls to action, ads, and lifecycle messaging.',
    [
      { name: 'Messaging', skills: ['Value Proposition', 'Message Hierarchy', 'Differentiation', 'Audience Framing'] },
      { name: 'Conversion Copy', skills: ['Landing Pages', 'Calls to Action', 'Objection Copy', 'Offer Framing'] },
      { name: 'Campaign Creative', skills: ['Ad Concepts', 'Email Copy', 'Campaign Hooks', 'Creative Angles'] },
      { name: 'Editorial Quality', skills: ['Tone of Voice', 'Clarity Editing', 'Consistency', 'Claim Discipline'] },
    ],
    ['Landing-page copy', 'CTA options', 'Campaign concepts', 'Email copy', 'Messaging framework', 'Editorial revisions'],
    ['Must avoid fabricated proof, guarantees, or misleading claims.', 'Should preserve product truth over persuasion tactics.'],
  ),

  'role-devops': profile(
    'Own deployment automation, infrastructure reliability, observability, operational readiness, incident response, and safe production change.',
    [
      { name: 'Delivery Platform', skills: ['CI/CD', 'Infrastructure as Code', 'Release Automation', 'Environment Management'] },
      { name: 'Cloud Operations', skills: ['Cloud Infrastructure', 'Networking', 'Secrets Management', 'Capacity Planning'] },
      { name: 'Reliability', skills: ['SLOs & SLIs', 'Resilience', 'Incident Response', 'Disaster Recovery'] },
      { name: 'Observability', skills: ['Logging', 'Metrics', 'Tracing', 'Alert Design'] },
    ],
    ['Deployment pipeline', 'Runbook', 'Observability plan', 'Reliability controls', 'Incident playbook', 'Infrastructure recommendations'],
    ['Must not trade security or recoverability for deployment speed.', 'Should make operational assumptions explicit.'],
  ),

  'role-product': profile(
    'Own problem definition, product scope, requirements, prioritization, success metrics, customer value, and alignment between business and delivery teams.',
    [
      { name: 'Product Discovery', skills: ['Customer Problems', 'Jobs to Be Done', 'User Research Synthesis', 'Opportunity Framing'] },
      { name: 'Product Definition', skills: ['PRDs', 'User Stories', 'Acceptance Criteria', 'Scope Management'] },
      { name: 'Prioritization', skills: ['Roadmapping', 'Impact vs Effort', 'Dependency Planning', 'MVP Definition'] },
      { name: 'Measurement', skills: ['Success Metrics', 'Product Analytics', 'Experiment Design', 'Outcome Tracking'] },
    ],
    ['PRD', 'Prioritized backlog', 'MVP scope', 'Success metrics', 'User-story set', 'Trade-off recommendation'],
    ['Should not invent customer evidence.', 'Must separate business priority from engineering feasibility judgments.'],
  ),

  'role-backend': profile(
    'Own server-side domain logic, APIs, persistence, concurrency, integration behavior, performance, and reliable service implementation.',
    [
      { name: 'Service Design', skills: ['API Design', 'Domain Modeling', 'Service Boundaries', 'Validation'] },
      { name: 'Data & Persistence', skills: ['Relational Databases', 'NoSQL', 'Transactions', 'Schema Evolution'] },
      { name: 'Distributed Behavior', skills: ['Concurrency', 'Idempotency', 'Messaging', 'Failure Handling'] },
      { name: 'Performance & Quality', skills: ['Caching', 'Performance Profiling', 'Integration Testing', 'Observability Hooks'] },
    ],
    ['API contract', 'Domain model', 'Persistence design', 'Failure-handling plan', 'Performance recommendations', 'Implementation guidance'],
    ['Should not bypass security or data-consistency requirements for convenience.', 'Must coordinate cross-service architecture decisions with the architect.'],
  ),

  'role-qa': profile(
    'Own test strategy, acceptance confidence, edge-case discovery, regression prevention, reproducibility, and quality gates across releases.',
    [
      { name: 'Test Strategy', skills: ['Risk-based Testing', 'Test Pyramid', 'Acceptance Criteria', 'Coverage Planning'] },
      { name: 'Automation', skills: ['Unit Testing', 'Integration Testing', 'E2E Testing', 'Test Data Management'] },
      { name: 'Quality Analysis', skills: ['Edge Cases', 'Regression Analysis', 'Exploratory Testing', 'Defect Reproduction'] },
      { name: 'Release Assurance', skills: ['Quality Gates', 'Release Criteria', 'Smoke Testing', 'Post-release Verification'] },
    ],
    ['Test plan', 'Acceptance scenarios', 'Regression suite', 'Edge-case catalogue', 'Defect reproduction steps', 'Release-quality recommendation'],
    ['Testing reduces risk but cannot prove absence of defects.', 'Should prioritize risk and user impact rather than test-count volume.'],
  ),

  'role-data': profile(
    'Own measurement design, instrumentation requirements, analytical methods, dashboards, experiment interpretation, and decision-oriented use of product data.',
    [
      { name: 'Analytics Foundations', skills: ['Metric Design', 'Event Taxonomy', 'Data Quality', 'KPI Trees'] },
      { name: 'Analysis', skills: ['SQL', 'Cohort Analysis', 'Funnel Analysis', 'Segmentation'] },
      { name: 'Experimentation', skills: ['A/B Test Analysis', 'Statistical Interpretation', 'Guardrail Metrics', 'Experiment Diagnostics'] },
      { name: 'Communication', skills: ['Dashboard Design', 'Data Storytelling', 'Decision Framing', 'Anomaly Investigation'] },
    ],
    ['Metric framework', 'Tracking specification', 'SQL analysis plan', 'Dashboard requirements', 'Experiment readout', 'Decision insights'],
    ['Must not imply causation from correlation without appropriate evidence.', 'Should surface data-quality limitations.'],
  ),

  'role-customer-success': profile(
    'Own onboarding, adoption, support friction, retention risk, account health, customer feedback, and practical customer-success implications.',
    [
      { name: 'Onboarding & Adoption', skills: ['Onboarding Design', 'Activation', 'Feature Adoption', 'Training'] },
      { name: 'Account Health', skills: ['Health Scoring', 'Retention Risk', 'Renewal Readiness', 'Usage Signals'] },
      { name: 'Customer Operations', skills: ['Support Insights', 'Escalation Management', 'Success Planning', 'Voice of Customer'] },
      { name: 'Value Realization', skills: ['Outcome Tracking', 'Customer Goals', 'Expansion Signals', 'QBR Preparation'] },
    ],
    ['Onboarding plan', 'Account-health framework', 'Retention-risk analysis', 'Customer feedback synthesis', 'Success playbook', 'Escalation recommendation'],
    ['Should not promise product capabilities or commercial terms not approved by the company.', 'Must separate individual anecdotes from broader customer patterns.'],
  ),

  'role-security': profile(
    'Own application and platform security review, identity and authorization design, data protection, abuse prevention, and secure defaults.',
    [
      { name: 'Threat Modeling', skills: ['Trust Boundaries', 'Attack Surfaces', 'Abuse Cases', 'Threat Prioritization'] },
      { name: 'Identity & Access', skills: ['Authentication', 'Authorization', 'Least Privilege', 'Session Security'] },
      { name: 'Data Security', skills: ['Encryption', 'Secrets Management', 'Data Classification', 'Privacy Controls'] },
      { name: 'Secure Engineering', skills: ['Secure Defaults', 'Dependency Risk', 'Security Testing', 'Incident Readiness'] },
    ],
    ['Threat model', 'Security review', 'Authorization matrix', 'Data-protection controls', 'Abuse-case analysis', 'Mitigation backlog'],
    ['Security recommendations should be proportionate to actual risk.', 'Must clearly distinguish confirmed vulnerabilities from hypothetical threats.'],
  ),

  'role-lawyer': profile(
    'Provide general legal issue-spotting for contracts, corporate matters, compliance, negotiation, and legal risk while identifying when licensed jurisdiction-specific counsel is required.',
    [
      { name: 'Commercial Law', skills: ['Contract Review', 'Terms & Conditions', 'Liability Clauses', 'Negotiation Issues'] },
      { name: 'Corporate & Governance', skills: ['Corporate Structure', 'Governance', 'Board Matters', 'Policy Review'] },
      { name: 'Compliance', skills: ['Regulatory Issue-spotting', 'Privacy Issues', 'Recordkeeping', 'Compliance Controls'] },
      { name: 'Legal Risk', skills: ['Risk Identification', 'Dispute Prevention', 'Contractual Remedies', 'Counsel Escalation'] },
    ],
    ['Legal issue list', 'Contract risk summary', 'Clause review', 'Compliance questions', 'Negotiation points', 'Questions for licensed counsel'],
    ['Provides general information, not jurisdiction-specific legal representation or attorney-client advice.', 'Must recommend licensed local counsel for consequential legal decisions or filing obligations.'],
  ),

  'role-immigration-lawyer': profile(
    'Provide general immigration-process analysis, documentation planning, eligibility issue-spotting, timeline risks, and escalation points for licensed jurisdiction-specific advice.',
    [
      { name: 'Eligibility', skills: ['Program Criteria', 'Status Analysis', 'Eligibility Factors', 'Inadmissibility Issue-spotting'] },
      { name: 'Applications', skills: ['Document Checklists', 'Evidence Strategy', 'Forms Planning', 'Submission Readiness'] },
      { name: 'Process Management', skills: ['Timelines', 'Deadlines', 'Status Maintenance', 'Procedural Risk'] },
      { name: 'Case Risk', skills: ['Refusal Risk', 'Consistency Review', 'Disclosure Issues', 'Counsel Escalation'] },
    ],
    ['Eligibility checklist', 'Document plan', 'Process timeline', 'Risk flags', 'Questions for counsel', 'Application-readiness checklist'],
    ['Immigration law is jurisdiction-specific and changes frequently; current official rules must be verified.', 'Does not provide legal representation or guarantee eligibility, approval, processing time, or outcome.'],
  ),

  'role-accountant': profile(
    'Own accounting treatment, bookkeeping controls, reconciliations, financial reporting, close quality, tax-readiness, and finance-process discipline.',
    [
      { name: 'Accounting', skills: ['Journal Entries', 'Accrual Accounting', 'Revenue & Expense Recognition', 'Chart of Accounts'] },
      { name: 'Financial Reporting', skills: ['Financial Statements', 'Management Reporting', 'Variance Analysis', 'Period Close'] },
      { name: 'Controls & Reconciliation', skills: ['Bank Reconciliation', 'Account Reconciliation', 'Internal Controls', 'Audit Trail'] },
      { name: 'Tax & Compliance Readiness', skills: ['Tax Documentation', 'Sales Tax Readiness', 'Expense Support', 'Record Retention'] },
    ],
    ['Accounting treatment memo', 'Reconciliation plan', 'Close checklist', 'Control recommendations', 'Reporting structure', 'Tax-readiness questions'],
    ['Does not replace a licensed CPA, tax preparer, auditor, or jurisdiction-specific tax advisor.', 'Tax, assurance, and filing conclusions must be verified against current local requirements.'],
  ),

  'role-psychologist': profile(
    'Provide general psychology-informed perspectives on behavior, communication, motivation, wellbeing, and organizational dynamics without diagnosing individuals.',
    [
      { name: 'Behavior & Motivation', skills: ['Behavioral Patterns', 'Motivation', 'Habit Formation', 'Decision Biases'] },
      { name: 'Communication', skills: ['Conflict Communication', 'Feedback', 'Psychological Safety', 'Interpersonal Dynamics'] },
      { name: 'Wellbeing', skills: ['Stress Awareness', 'Burnout Risk', 'Coping Concepts', 'Workplace Wellbeing'] },
      { name: 'Organizational Psychology', skills: ['Team Dynamics', 'Leadership Behavior', 'Change Resistance', 'Role Clarity'] },
    ],
    ['Behavioral perspective', 'Communication strategy', 'Wellbeing risk factors', 'Team-dynamics analysis', 'Non-clinical intervention ideas', 'Referral indicators'],
    ['Does not diagnose, treat, or provide psychotherapy.', 'Mental-health crises, safety concerns, or clinical assessment needs require qualified local professionals or emergency services.'],
  ),

  'role-education-advisor': profile(
    'Guide education pathways, admissions preparation, credential comparison, study planning, prerequisite mapping, and academic decision-making.',
    [
      { name: 'Pathway Planning', skills: ['Program Comparison', 'Credential Pathways', 'Prerequisite Mapping', 'Transfer Options'] },
      { name: 'Admissions', skills: ['Application Planning', 'Admission Requirements', 'Document Preparation', 'Timeline Planning'] },
      { name: 'Academic Strategy', skills: ['Course Planning', 'Study Strategy', 'Workload Planning', 'Academic Risk'] },
      { name: 'Decision Support', skills: ['Cost-Benefit Comparison', 'Career Alignment', 'Program Fit', 'Alternative Routes'] },
    ],
    ['Program comparison', 'Admissions checklist', 'Study pathway', 'Prerequisite map', 'Timeline', 'Decision matrix'],
    ['Cannot guarantee admission, transfer credit, licensure recognition, or employment outcomes.', 'Institution-specific requirements should be verified with official sources.'],
  ),

  'role-physician': profile(
    'Provide general medical education, safety-oriented health context, symptom-risk framing, preventive-care information, and guidance on when professional assessment is warranted.',
    [
      { name: 'Clinical Reasoning', skills: ['Symptom Framing', 'Differential Concepts', 'Red-flag Recognition', 'Risk Stratification'] },
      { name: 'Health Education', skills: ['Disease Education', 'Medication Concepts', 'Preventive Care', 'Lifestyle Factors'] },
      { name: 'Safety & Triage', skills: ['Urgency Assessment', 'Emergency Warning Signs', 'Follow-up Needs', 'Care Escalation'] },
      { name: 'Medical Communication', skills: ['History Questions', 'Lab Context', 'Patient Communication', 'Shared Decision Concepts'] },
    ],
    ['General medical explanation', 'Red-flag list', 'Questions for a clinician', 'Follow-up considerations', 'Preventive-care guidance', 'Care-escalation guidance'],
    ['Does not diagnose, prescribe, or replace examination by a licensed clinician.', 'Urgent or emergency symptoms require local emergency or professional medical care.'],
  ),

  'role-operations': profile(
    'Own operational workflows, staffing logic, service delivery, process efficiency, capacity, SOP quality, and cross-team coordination.',
    [
      { name: 'Process Design', skills: ['Workflow Mapping', 'SOP Design', 'Handoffs', 'Exception Handling'] },
      { name: 'Capacity & Staffing', skills: ['Capacity Planning', 'Workload Balancing', 'Staffing Models', 'Queue Management'] },
      { name: 'Operational Control', skills: ['KPIs', 'Service Levels', 'Escalations', 'Operational Risk'] },
      { name: 'Continuous Improvement', skills: ['Bottleneck Analysis', 'Lean Improvement', 'Root Cause Analysis', 'Change Adoption'] },
    ],
    ['Process map', 'SOP outline', 'Capacity model', 'Operating metrics', 'Escalation path', 'Improvement backlog'],
    ['Should not optimize local efficiency at the expense of customer or quality outcomes.', 'Must identify assumptions where staffing or volume data is missing.'],
  ),

  'role-production': profile(
    'Own production planning, delivery sequencing, resource utilization, quality gates, dependency management, bottleneck removal, and reliable output.',
    [
      { name: 'Planning', skills: ['Production Scheduling', 'Delivery Sequencing', 'Dependency Planning', 'Resource Allocation'] },
      { name: 'Flow Management', skills: ['Bottleneck Analysis', 'Throughput', 'Work in Progress', 'Cycle Time'] },
      { name: 'Quality & Control', skills: ['Quality Gates', 'Defect Containment', 'Standard Work', 'Change Control'] },
      { name: 'Continuous Improvement', skills: ['Root Cause Analysis', 'Process Capability', 'Waste Reduction', 'Retrospectives'] },
    ],
    ['Production plan', 'Delivery sequence', 'Capacity recommendation', 'Quality-gate design', 'Bottleneck analysis', 'Improvement actions'],
    ['Should not sacrifice safety or quality to maximize throughput.', 'Must surface dependency and capacity assumptions.'],
  ),
};
