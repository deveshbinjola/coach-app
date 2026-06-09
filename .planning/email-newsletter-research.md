# Email / Newsletter Platform Research for Soma

**Date:** 2026-05-27
**Purpose:** Strategic build-vs-buy analysis for Soma's email/newsletter capabilities
**Audience:** Internal product decision-making

---

## 1. How Email Platforms Give "Every Coach a Newsletter"

### Platform Landscape & Pricing

| Platform | Free Tier | Entry Paid | Mid-Tier | Target User | Coach Fit |
|----------|-----------|------------|----------|-------------|-----------|
| **Kit (ConvertKit)** | 10K subs, unlimited emails | $39/mo (1K subs) | $59/mo (3K subs) | Solo creators, coaches, podcasters | HIGH -- 94% micro-business user base |
| **Mailchimp** | 250 contacts, 500 sends/mo | ~$13/mo (500 contacts) | $90/mo (5K contacts) | SMBs, general marketing | MEDIUM -- bloated for coaches |
| **Beehiiv** | 2,500 subs, unlimited sends | $49/mo (Scale) | $99/mo (Max) | Newsletter-first creators | MEDIUM -- content-heavy coaches |
| **Flodesk** | None | ~$38/mo (Lite) | Pro tier available | Creatives, coaches, service providers | HIGH -- design-forward, simple |
| **ActiveCampaign** | None | $15/mo (1K contacts) | $79/mo (Pro) | SMBs needing automation + CRM | MEDIUM -- steep learning curve |
| **MailerLite** | 500 subs, 12K emails/mo | $10/mo (500 subs) | $20/mo (Advanced) | Budget-conscious solopreneurs | HIGH -- best value |
| **GoHighLevel** | None | $97/mo (Starter) | $297/mo (Unlimited) | Agencies, coaches with clients | HIGH -- all-in-one but complex |

### Pricing Trends (2025-2026)
- Kit raised prices 34% in Sept 2025 (Creator plan $29 to $39/mo)
- MailerLite cut free tier from 1,000 to 500 subscribers (Sept 2025)
- Mailchimp free plan slashed to 250 contacts (was 500, was 2,000)
- SendGrid killed permanent free tier entirely (May 2025)
- ActiveCampaign now charges for ALL contacts including unsubscribed/bounced (Nov 2025)
- Industry-wide: free tiers shrinking, prices rising 10-15% annually

### What Makes It Easy for Non-Technical Coaches

**The "magic" is 4 components:**

1. **Drag-and-drop template editor** -- no HTML knowledge needed. Flodesk and Mailchimp lead here with visual builders. Kit uses a simpler text-focused editor that many coaches prefer (feels more personal, less "marketing-y")

2. **Pre-built automation templates** -- "Welcome Sequence," "Launch Sequence," "Webinar Follow-up" as one-click starting points. Kit and ActiveCampaign offer the most coach-relevant templates

3. **Subscriber management abstraction** -- tags, segments, and lists presented as simple concepts. Coaches think in terms of "leads," "clients," "alumni" -- platforms that map to these mental models win

4. **Landing page / form builders** -- sign-up forms and landing pages bundled in, so coaches don't need a separate website builder just to collect emails

### Tech Stack Under the Hood

Every ESP is roughly the same architecture:
- **Sending infrastructure:** SMTP relay (own or AWS SES/SendGrid underneath)
- **Template engine:** HTML email renderer (MJML, custom, or React Email)
- **Subscriber store:** Database with tagging/segmentation
- **Automation engine:** Event-driven workflow runner (triggers + delays + conditions)
- **Analytics:** Open/click tracking via pixel + link wrapping
- **Deliverability:** DKIM/SPF/DMARC management, IP warming, bounce handling

### Which Platforms Do Coaches Actually Use?

Based on market data, recommendations from coaching communities, and platform demographics:

1. **Kit (ConvertKit)** -- the default choice. 94% of Kit users are solo micro-businesses. Built specifically for creators/coaches. Most coaching business courses recommend it
2. **MailerLite** -- the budget alternative. 4:1 migration ratio FROM Mailchimp, gaining fast among price-sensitive solopreneurs
3. **Flodesk** -- the design-forward choice. Popular with female coaches, wellness practitioners, and creatives who want beautiful emails without tech complexity
4. **Mailchimp** -- legacy choice. Many coaches started here but increasingly migrate away due to rising prices and complexity
5. **ActiveCampaign** -- the power user choice. Coaches who need deep automation and CRM, but steep learning curve limits adoption
6. **GoHighLevel** -- the agency/scaling choice. Coaches who want all-in-one (CRM + email + funnels + scheduling) but at $97+/mo, only for established practices

---

## 2. What Email Features Do Coaches Actually Need

### Core Feature Requirements (Ranked by Priority)

#### Tier 1: Must-Have (used weekly or more)

**Welcome Sequences**
- 3-5 email automated series triggered by opt-in
- Typical flow: Deliver lead magnet > Share story/philosophy > Social proof > Discovery call CTA
- This is the single highest-ROI email asset for coaches
- Key requirement: fires immediately (within seconds, not batched)

**Broadcast/Newsletter**
- Weekly or biweekly insights, tips, stories
- Coaches use this to stay top-of-mind with their list
- Needs to feel personal, not corporate (plain text often outperforms designed emails)
- Subject line testing important for open rates

**Launch Sequences**
- 5-10 email series for program/cohort/course launches
- Time-sensitive with countdown urgency
- Needs: conditional branching (clicked vs. didn't click), waitlist to open cart transitions
- Typically run 3-4 times per year

**Basic Segmentation**
- Minimum segments: Leads / Active Clients / Alumni / Prospects
- Tag-based (not list-based) is strongly preferred
- Coaches need to exclude current clients from sales sequences

#### Tier 2: Important (used monthly)

**Nurture Sequences**
- Long-running drip campaigns (8-20 emails over weeks/months)
- Turns cold leads into warm prospects
- Needs: engagement-based branching (if opened X, send Y)

**Session Follow-Up Automations**
- Post-session recap emails (what we covered, homework, next steps)
- This is UNIQUE to coaching -- general ESPs don't support this natively
- Currently done manually by most coaches (copy-paste from notes)
- Integration with scheduling tools (Calendly, Acuity, Cal.com) critical

**Client Communication**
- Different from marketing emails -- these are 1:1 or small-group
- Session reminders, check-ins between sessions, resource sharing
- Should NOT come from marketing email system (different reply expectations)
- Most coaches use regular email (Gmail) for this, creating a fragmented experience

#### Tier 3: Nice-to-Have (used occasionally)

**Re-engagement Campaigns**
- Win-back sequences for cold subscribers
- "Are you still interested?" style automation

**Event/Webinar Sequences**
- Pre-webinar reminders, post-webinar follow-up
- Registration confirmation + replay delivery

**Referral/Testimonial Requests**
- Automated ask after program completion
- Timed to when client satisfaction peaks

### Integration Requirements

| Integration | Priority | Why |
|-------------|----------|-----|
| Scheduling (Calendly, Cal.com, Acuity) | CRITICAL | Trigger emails based on booked/completed sessions |
| Payment (Stripe) | HIGH | Trigger onboarding flows on purchase |
| Course/Content (Teachable, Thinkific, Kajabi) | HIGH | Enrollment triggers, progress-based emails |
| CRM (for client pipeline) | HIGH | Segment by client stage |
| Social media | MEDIUM | Cross-promote newsletter signup |
| Zapier/Make | MEDIUM | Catch-all for custom integrations |
| Zoom/Google Meet | LOW-MEDIUM | Session follow-up triggers |

### What Coaches Complain About (Common Pain Points)

**From coaching communities, forums, and review sites:**

1. **"Too many tools"** -- Coaches commonly run 4-7 separate tools: email (Kit), scheduling (Calendly), payments (Stripe), CRM (spreadsheet or HoneyBook), course delivery (Teachable), website (Squarespace), and social scheduling (Later). Each costs $20-100/mo and none talk to each other well

2. **"My emails don't sound like me"** -- Template-driven emails feel generic. Coaches have a distinctive voice and philosophy, and canned templates strip that away. They spend hours rewriting template suggestions

3. **"I can't connect session work to follow-up"** -- After a coaching session, coaches want to send a personalized follow-up referencing what was discussed. No ESP supports this. Coaches either do it manually (time-consuming) or skip it (missed opportunity)

4. **"Automation is too complicated"** -- Visual workflow builders still confuse non-technical coaches. They want "when someone books a call, send these 3 emails" without building a flowchart

5. **"I'm paying for contacts who aren't active"** -- Mailchimp and ActiveCampaign billing practices (counting unsubscribed contacts) frustrate coaches on tight budgets

6. **"I don't know what to write"** -- Content creation is the bottleneck, not the sending tool. Coaches stare at blank screens, not sure what their newsletter should say this week

7. **"My marketing emails and client emails are separate worlds"** -- The prospect-to-client journey creates a gap between marketing (Kit/Mailchimp) and client management (Gmail/HoneyBook), resulting in leads falling through cracks

---

## 3. What's MISSING from Current Platforms

### Gap 1: Voice-Matched Content Generation

**The Problem:** Every coach has a unique voice, philosophy, and way of explaining things. Current AI writing tools (Jasper, Copy.ai) produce generic content that sounds like a marketing textbook. Coaches spend more time rewriting AI output than they save.

**What Coaches Want:** An AI that has learned THEIR voice from their existing content (social posts, blog posts, session recordings, past emails) and generates drafts that sound like them. Not "write me an email" but "write this week's newsletter in MY voice about [topic]."

**Current Solutions:**
- Jasper Brand Voice -- trains on your content but generic tone matching
- Meet Sona -- speak for 10 minutes, AI creates content from your speech patterns
- Coachvox -- AI chatbot clone of you, but content creation is separate
- None of these integrate with email sending

**Soma Opportunity:** Build voice training into the platform itself. Every piece of content a coach creates in Soma (Brand OS outputs, social posts, session notes) becomes training data for their AI voice model. Email drafts generated in-platform would sound like the coach from day one.

### Gap 2: Session-Aware Email Follow-Ups

**The Problem:** After a coaching session, the most impactful thing a coach can do is send a personalized follow-up: "Here's what we covered, here's your homework, here's what to focus on this week." Currently 100% manual.

**What Coaches Want:** Session notes (taken during or after the call) automatically transformed into a client follow-up email with key takeaways, action items, and next session prep.

**Current Solutions:** None. No ESP connects to session context. Coaches either:
- Copy-paste from handwritten notes (slow, inconsistent)
- Use a generic "thanks for the session" template (impersonal)
- Skip follow-ups entirely (most common, worst outcome)

**Soma Opportunity:** If Soma already has session notes or coaching context, generating a session-aware follow-up email is a natural extension. This would be a genuinely differentiated feature no competitor offers.

### Gap 3: Unified CRM + Email + Coaching Platform

**The Problem:** Coaches run parallel systems that don't share data:
- Marketing ESP (Kit) knows about leads and open rates
- CRM (HoneyBook/spreadsheet) knows about client status and payments
- Scheduling tool (Calendly) knows about sessions
- Course platform (Teachable) knows about program enrollment

No single system has the full picture of a client's journey from first email to program completion to alumni.

**What Coaches Want:** One place where they can see: "This person joined my list 3 months ago, opened 80% of emails, booked a discovery call, enrolled in my program, completed 6/8 sessions, and hasn't engaged in 2 weeks."

**Current Closest Solutions:**
- GoHighLevel ($97-297/mo) -- closest to all-in-one but complex, agency-oriented
- Paperbell ($47.50/mo) -- coaching-specific but email marketing is basic
- CoachAccountable ($20-4000/mo) -- great session tracking, weak email

**Soma Opportunity:** If Soma already has Brand OS, client management, and session context, adding email makes it the first platform where the coaching journey and the marketing journey live in the same database.

### Gap 4: Content Repurposing Pipeline

**The Problem:** Coaches create content across channels (Instagram, blog, podcast, YouTube) but manually reformat for newsletters. A carousel becomes a blog post becomes a newsletter, but each transformation is manual.

**What Coaches Want:** Write/record once, distribute everywhere. Specifically: turn a social post or blog post into a newsletter with one click, maintaining voice consistency.

**Current Solutions:**
- Descript -- audio/video to text, but no email output
- Repurpose.io -- social media cross-posting, not email
- Manual copy-paste with reformatting

**Soma Opportunity:** If Soma already handles content creation (Brand OS generates content pillars and posts), the newsletter becomes another output format. "Turn this week's best Instagram carousel into a newsletter" is a natural workflow.

### Gap 5: Client Journey Automation

**The Problem:** The transition from "lead" to "client" to "alumni" involves manual status changes across multiple tools. No platform automates the full lifecycle:

Subscriber > Lead (engaged) > Discovery Call Booked > Client (paid) > Active Program > Completion > Alumni > Referral Source

**What Coaches Want:** Automatic progression through these stages based on real events (payment received, session completed, program finished), with appropriate email sequences triggered at each transition.

**Current Solutions:** Possible with Zapier glue code across 3-4 tools, but fragile and requires technical setup most coaches can't do.

**Soma Opportunity:** If all these events live in one platform, lifecycle automation becomes simple configuration, not integration engineering.

### Gap 6: AI-Generated Email Drafts in Coach's Voice

**The Problem:** Coaches know they should email their list weekly but don't because of blank-page syndrome. The content creation bottleneck kills consistency.

**What Coaches Want:** "Here's what happened this week in my practice / what I'm thinking about / a topic I want to explore" -- and the AI turns that seed into a full newsletter draft in their voice, with their frameworks and examples.

**Current Solutions:**
- Kit has basic AI subject line suggestions
- MailerLite has an AI writing assistant
- ActiveCampaign has predictive content
- None learn the coach's specific voice, frameworks, or philosophy

**Soma Opportunity:** Brand OS already maps voice and content pillars. Using that as the foundation for email draft generation would be uniquely differentiated. The AI doesn't just "write an email" -- it writes an email using the coach's voice profile, referencing their frameworks, and drawing from their content library.

---

## 4. Build vs Buy Analysis

### Email Infrastructure Layer

| Component | Build? | Buy? | Recommendation | Rationale |
|-----------|--------|------|----------------|-----------|
| **Email sending (SMTP/API)** | NO | YES | **Resend** ($20/mo for 50K emails) or **Amazon SES** ($0.10/1K emails) | Sending infrastructure is commodity. Building SMTP relay is pointless. Resend for best DX with React/Next.js stack; SES for lowest cost at scale |
| **Deliverability management** | NO | YES | Comes with chosen ESP | IP warming, bounce handling, DKIM/SPF -- let the provider handle this |
| **Template rendering engine** | PARTIAL | PARTIAL | **React Email** (open source, by Resend team) | Build templates as React components. 18K GitHub stars, industry standard for Next.js apps. Free, open source |
| **Drag-and-drop editor** | NO | YES | **Unlayer** ($250-750/mo) or build simple block editor | Full drag-and-drop is 6+ months of engineering. Unlayer embeds as React component. BUT -- coaches may not need this; many prefer plain text |
| **Subscriber database** | YES | NO | Build into Soma's existing Supabase | Subscribers are just contacts in the CRM. Don't create a separate system |
| **Segmentation engine** | YES | NO | Build on top of Supabase with tag-based system | Coach-specific segments (lead/client/alumni) map to Soma's data model |
| **Automation engine** | BUILD | -- | Build event-driven workflow system | This is where Soma differentiates. Session events, payment events, enrollment events all trigger emails. No off-the-shelf tool has coaching context |
| **Analytics (opens/clicks)** | PARTIAL | PARTIAL | Track via Resend webhooks + own DB | Resend provides open/click webhooks. Store in Supabase for coaching-specific analytics |
| **Unsubscribe/compliance** | BUILD | -- | Build CAN-SPAM/GDPR compliant unsubscribe | Required by law, straightforward to build, must be in every email |

### Feature Layer: Build vs Integrate vs Skip

| Feature | Difficulty | Recommendation | Why |
|---------|------------|----------------|-----|
| **Welcome sequence builder** | Medium | BUILD | Core differentiator when combined with coach voice. Template library with coach-specific sequences (discovery call, program enrollment, etc.) |
| **Broadcast/newsletter sending** | Easy | BUILD | Simple compose + send to segment. Use React Email for templates, Resend for delivery |
| **Launch sequence automation** | Medium | BUILD | Time-based drip with conditional logic. Build a simple trigger > delay > send engine |
| **Nurture sequence automation** | Medium | BUILD (later) | Same engine as launch sequences, just longer. Phase 2 feature |
| **Session follow-up emails** | Medium | BUILD | **Soma's killer feature.** No competitor has this. Session notes > AI-generated follow-up > send. Only possible because Soma owns the session context |
| **AI email drafts in coach voice** | Hard | BUILD | **Primary differentiator.** Brand OS voice profile + content pillars + AI = email drafts that sound like the coach. Build on Claude/GPT API |
| **Content repurposing to email** | Medium | BUILD | "Turn this post into a newsletter" using AI. Leverages Brand OS content library |
| **Client journey automation** | Hard | BUILD (phased) | Full lifecycle triggers. Phase 1: manual stage changes trigger emails. Phase 2: automatic stage transitions |
| **Visual drag-and-drop editor** | Very Hard | BUY (Unlayer) or SKIP | 6+ months to build well. Most coaches prefer simple text editors anyway. Consider Unlayer only if demand proves real |
| **Advanced analytics** | Medium | BUILD (later) | Open rates, click rates, revenue attribution. Phase 2-3 |
| **A/B testing** | Medium | SKIP (for now) | Not critical for coaches with small lists (<5K). Add in Phase 3 |
| **Paid newsletter subscriptions** | Hard | SKIP | Beehiiv's territory. Coaches monetize through programs, not newsletter subscriptions |

### Recommended Sending Infrastructure

**Primary recommendation: Resend**
- $20/mo for 50,000 emails (more than enough for early-stage)
- Free tier: 3,000 emails/mo for development
- React Email integration (matches Soma's Next.js stack perfectly)
- TypeScript SDK, clean API, 15-minute setup
- Webhooks for open/click/bounce tracking
- Built on Amazon SES underneath (reliable infrastructure)

**Alternative at scale: Amazon SES directly**
- $0.10 per 1,000 emails (vs Resend's ~$0.40/1K at Pro tier)
- Makes sense above 100K emails/month
- More operational overhead (DNS verification, sandbox exit, IAM)
- No template rendering -- need to pair with React Email separately

**NOT recommended:**
- SendGrid: killed free tier, owned by Twilio (acquisition risk), legacy API
- Postmark: excellent deliverability but transactional-only, no marketing email
- Mailchimp/Kit APIs: possible but creates dependency on competitor platform

### The 80/20: What 20% of Features Gives 80% of Value

**Build these 5 things first (in order):**

1. **Simple email composer + send** -- Rich text editor (not drag-and-drop), subject line, send to segment. Use React Email templates + Resend API. 2-3 weeks of engineering.

2. **Welcome sequence automation** -- Trigger: new subscriber. Action: send email series with delays. 3-5 pre-built templates for coaches. 2-3 weeks of engineering.

3. **AI draft generation in coach voice** -- "Write this week's newsletter about [topic]" using Brand OS voice profile. Generate draft, coach edits, sends. 2-4 weeks of engineering (leveraging existing AI infrastructure).

4. **Session follow-up emails** -- After session, auto-generate follow-up from notes/context. Coach reviews and sends. 2-3 weeks of engineering.

5. **Basic segmentation** -- Tag contacts as Lead/Client/Alumni. Send to segments. Exclude segments from campaigns. 1-2 weeks of engineering.

**Total estimated engineering: 10-15 weeks for MVP email feature set.**

### What Makes Soma's Email Feature DIFFERENT from "Another ConvertKit"

Soma should NOT try to be a better ConvertKit. That's a race to commodity features and pricing pressure. Instead, Soma's email should be differentiated by three things no ESP can replicate:

**1. Coach Voice Intelligence**
Every email draft is generated using the coach's Brand OS voice profile -- their frameworks, their language patterns, their philosophy. Kit's AI writes generic creator emails. Soma's AI writes emails that sound like THIS specific coach.

**2. Session-Connected Communication**
Emails that reference what happened in coaching sessions -- follow-ups with specific takeaways, homework assignments, and next-session prep. This is impossible for standalone ESPs because they don't have session context.

**3. Unified Client Journey**
The subscriber database IS the client database. When a lead books a discovery call, enrolls in a program, completes sessions, and becomes an alumnus, the email system knows. No Zapier glue required. Stage transitions automatically trigger the right email sequences.

**Positioning: "The only email tool that knows your coaching practice."**

ConvertKit knows you're a creator. Soma knows you're a coach who just finished a session about boundary-setting with a client who's been in your program for 6 weeks and responds best to direct, no-nonsense communication.

---

## Appendix A: Detailed Platform Pricing Comparison (as of May 2026)

### At 1,000 Subscribers

| Platform | Monthly Cost | Key Limitations |
|----------|-------------|-----------------|
| Kit (ConvertKit) | $39/mo (Creator) | Free tier allows 10K subs but limited to 1 automation |
| MailerLite | $10/mo (Growing) | Unlimited emails, 3 user seats |
| Mailchimp | ~$30/mo (Essentials) | Counts unsubscribed contacts toward limit |
| Flodesk | ~$38/mo (Lite) | 1 workflow automation, 25K subscriber cap |
| ActiveCampaign | $15/mo (Starter) | Basic automation only, CRM separate add-on |
| Beehiiv | Free (Launch) | 2,500 sub cap on free, limited automation |

### At 5,000 Subscribers

| Platform | Monthly Cost | Notes |
|----------|-------------|-------|
| Kit | $89/mo | Creator plan |
| MailerLite | $39/mo | Growing Business |
| Mailchimp | $90/mo (Essentials) | Hidden costs push to ~$110 effective |
| Flodesk | ~$38/mo | Same price (flat pricing advantage) |
| ActiveCampaign | ~$79/mo (Plus) | CRM add-on is $68/mo extra |
| Beehiiv | $49/mo (Scale) | Includes monetization tools |

### At 10,000 Subscribers

| Platform | Monthly Cost | Notes |
|----------|-------------|-------|
| Kit | $119/mo | Creator plan |
| MailerLite | $73/mo | Growing Business |
| Mailchimp | ~$150/mo | Standard plan, effective cost higher |
| Flodesk | ~$38/mo | Flat pricing -- best value at scale |
| ActiveCampaign | ~$139/mo | Plus plan |
| Beehiiv | $49/mo (Scale) | Great value for newsletter-heavy coaches |

## Appendix B: Sending Infrastructure Cost Comparison

### At 10,000 Emails/Month

| Provider | Monthly Cost | Notes |
|----------|-------------|-------|
| **Resend** | Free (3K/mo free tier) or $20/mo (Pro) | Best DX, React Email integration |
| **Amazon SES** | ~$1.00 | Cheapest, most operational overhead |
| **SendGrid** | $19.95/mo | Free tier killed May 2025 |
| **Postmark** | ~$15/mo | Best deliverability, transactional only |

### At 100,000 Emails/Month

| Provider | Monthly Cost | Notes |
|----------|-------------|-------|
| **Resend** | $20/mo + $45 overage = ~$65 | Pro plan + overage at $0.90/1K |
| **Amazon SES** | ~$10 + ancillary costs (~$15 total) | 3-10x cheaper than alternatives |
| **SendGrid** | ~$89/mo | Pro plan |
| **Postmark** | ~$110/mo | Highest quality, highest price |

## Appendix C: Coaching Platform Competitive Map

| Platform | Email | CRM | Scheduling | Payments | Session Notes | Content AI | Price |
|----------|-------|-----|------------|----------|---------------|------------|-------|
| **Kit** | Strong | No | No | Basic (tips) | No | Basic | $39-89/mo |
| **Paperbell** | Basic | Yes | Yes | Yes | No | No | $47.50/mo |
| **CoachAccountable** | No | Yes | Yes | Yes | Yes | No | $20-4000/mo |
| **GoHighLevel** | Strong | Strong | Yes | Yes | No | Basic | $97-297/mo |
| **Dubsado** | Basic | Yes | Yes | Yes | No | No | $20-40/mo |
| **HoneyBook** | Basic | Yes | Yes | Yes | No | No | $16-66/mo |
| **Practice** | Basic | Yes | Yes | Yes | Basic | No | $30-80/mo |
| **Soma (target)** | Strong + AI | Yes | Yes | Yes | Yes + AI | Strong (Brand OS) | TBD |

**Key Insight:** No existing platform combines strong email marketing with session-aware AI and coach voice intelligence. Soma would be first-in-category if it delivers on all three.

## Appendix D: Recommended Build Phases

### Phase 1: Email MVP (Weeks 1-6)
- Simple compose + send (rich text, not drag-and-drop)
- Subscriber management with tags (Lead/Client/Alumni)
- Basic analytics (sent, opened, clicked) via Resend webhooks
- Unsubscribe handling (CAN-SPAM compliant)
- Integration: Resend for sending, React Email for templates, Supabase for subscriber data

### Phase 2: Automation + AI Voice (Weeks 7-12)
- Welcome sequence builder (trigger > delay > send)
- AI email draft generation using Brand OS voice profile
- Session follow-up email generation
- Launch sequence support

### Phase 3: Advanced Features (Weeks 13-20)
- Client journey automation (lifecycle stage triggers)
- Content repurposing (social post > newsletter)
- Nurture sequences with engagement branching
- Advanced analytics and reporting
- A/B testing for subject lines

### Phase 4: Scale Features (Future)
- Visual drag-and-drop editor (Unlayer integration or custom)
- Revenue attribution
- Deliverability monitoring dashboard
- Multi-brand support for coaches with multiple programs
