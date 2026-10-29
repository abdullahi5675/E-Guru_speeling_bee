"""
Generate the Jigawa Spelling Bee v2 Feature Review Document (PDF)
for KowaguruTech CEO review.
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm, cm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.platypus import Flowable
import datetime

# ─── Output path ────────────────────────────────────────────────────────────
OUTPUT = r"C:\Users\M. Hassan Nayaya\Desktop\Spelling Beee\Jigawa_SpellingBee_v2_Feature_Review.pdf"

# ─── Brand colors ────────────────────────────────────────────────────────────
RED        = colors.HexColor("#cc1b1b")
RED_DARK   = colors.HexColor("#8b0000")
GREEN      = colors.HexColor("#1a7a1a")
GREEN_LITE = colors.HexColor("#22a822")
BLACK      = colors.HexColor("#0a0a0a")
DARK_BG    = colors.HexColor("#111111")
GREY_BG    = colors.HexColor("#f5f5f5")
GREY_MID   = colors.HexColor("#dddddd")
WHITE      = colors.white
ORANGE     = colors.HexColor("#cc6600")

PAGE_W, PAGE_H = A4

# ─── Styles ──────────────────────────────────────────────────────────────────
styles = getSampleStyleSheet()

def style(name, **kw):
    s = ParagraphStyle(name, **kw)
    return s

COVER_TITLE = style("CoverTitle",
    fontName="Helvetica-Bold", fontSize=26, textColor=WHITE,
    leading=32, alignment=TA_CENTER, spaceAfter=6)

COVER_SUB = style("CoverSub",
    fontName="Helvetica", fontSize=11, textColor=colors.HexColor("#dddddd"),
    leading=16, alignment=TA_CENTER, spaceAfter=4)

COVER_LABEL = style("CoverLabel",
    fontName="Helvetica-Bold", fontSize=9, textColor=RED,
    leading=14, alignment=TA_CENTER, spaceAfter=2, spaceBefore=2)

SECTION_HEAD = style("SectionHead",
    fontName="Helvetica-Bold", fontSize=14, textColor=WHITE,
    leading=18, spaceAfter=4, spaceBefore=2,
    backColor=RED_DARK,
    leftIndent=-12, rightIndent=-12,
    borderPadding=(6, 12, 6, 12))

SUBSEC_HEAD = style("SubSecHead",
    fontName="Helvetica-Bold", fontSize=11, textColor=RED,
    leading=16, spaceAfter=4, spaceBefore=10)

BODY = style("Body",
    fontName="Helvetica", fontSize=9.5, textColor=BLACK,
    leading=15, spaceAfter=3)

BODY_BOLD = style("BodyBold",
    fontName="Helvetica-Bold", fontSize=9.5, textColor=BLACK,
    leading=15, spaceAfter=3)

BULLET = style("Bullet",
    fontName="Helvetica", fontSize=9.5, textColor=BLACK,
    leading=15, leftIndent=16, bulletIndent=4,
    spaceAfter=2, bulletText="•")

NOTE_BOX = style("NoteBox",
    fontName="Helvetica-Oblique", fontSize=9, textColor=colors.HexColor("#555555"),
    leading=14, leftIndent=10, rightIndent=10, spaceAfter=4)

FOOTER_STYLE = style("Footer",
    fontName="Helvetica", fontSize=8, textColor=colors.HexColor("#888888"),
    alignment=TA_CENTER)

# ─── Custom Flowable: Colored Banner ────────────────────────────────────────
class ColorBanner(Flowable):
    def __init__(self, text, bg=RED_DARK, fg=WHITE, height=28, radius=4):
        super().__init__()
        self.text = text
        self.bg = bg
        self.fg = fg
        self.height = height
        self.radius = radius
        self.width = PAGE_W - 4*cm

    def draw(self):
        c = self.canv
        c.setFillColor(self.bg)
        c.roundRect(0, 0, self.width, self.height, self.radius, fill=1, stroke=0)
        c.setFillColor(self.fg)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(12, 9, self.text)

class InfoBox(Flowable):
    """A tinted info/note box."""
    def __init__(self, text, bg=colors.HexColor("#fff8e1"), border=ORANGE, width=None):
        super().__init__()
        self.text = text
        self.bg = bg
        self.border_col = border
        self._width = width or (PAGE_W - 4*cm)
        self.height = 32

    def wrap(self, availW, availH):
        self.width = min(self._width, availW)
        return self.width, self.height

    def draw(self):
        c = self.canv
        c.setFillColor(self.bg)
        c.setStrokeColor(self.border_col)
        c.setLineWidth(1.5)
        c.roundRect(0, 0, self.width, self.height, 4, fill=1, stroke=1)
        c.setFillColor(BLACK)
        c.setFont("Helvetica", 8.5)
        # Simple text wrap
        c.drawString(10, 11, self.text)

# ─── Table helper ────────────────────────────────────────────────────────────
def make_table(header, rows, col_widths=None, header_bg=RED_DARK, stripe=True):
    data = [header] + rows
    tbl = Table(data, colWidths=col_widths, repeatRows=1)
    style_cmds = [
        ("BACKGROUND", (0,0), (-1,0), header_bg),
        ("TEXTCOLOR",  (0,0), (-1,0), WHITE),
        ("FONTNAME",   (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE",   (0,0), (-1,0), 9),
        ("BOTTOMPADDING", (0,0), (-1,0), 7),
        ("TOPPADDING",    (0,0), (-1,0), 7),
        ("FONTNAME",   (0,1), (-1,-1), "Helvetica"),
        ("FONTSIZE",   (0,1), (-1,-1), 9),
        ("BOTTOMPADDING", (0,1), (-1,-1), 5),
        ("TOPPADDING",    (0,1), (-1,-1), 5),
        ("GRID",       (0,0), (-1,-1), 0.5, GREY_MID),
        ("VALIGN",     (0,0), (-1,-1), "MIDDLE"),
    ]
    if stripe:
        for i in range(1, len(data)):
            if i % 2 == 0:
                style_cmds.append(("BACKGROUND", (0,i), (-1,i), GREY_BG))
    tbl.setStyle(TableStyle(style_cmds))
    return tbl

# ─── Document build ──────────────────────────────────────────────────────────
def build_pdf():
    doc = SimpleDocTemplate(
        OUTPUT,
        pagesize=A4,
        topMargin=1.5*cm, bottomMargin=2*cm,
        leftMargin=2*cm, rightMargin=2*cm,
        title="Jigawa Spelling Bee v2 Feature Review",
        author="KowaguruTech"
    )

    story = []
    SP = Spacer(1, 5)
    BIG_SP = Spacer(1, 14)

    # ══════════════════════════════════════════════════════════════════════════
    # COVER BLOCK
    # ══════════════════════════════════════════════════════════════════════════
    def cover_page(canvas, doc):
        canvas.saveState()
        # Dark header block
        canvas.setFillColor(DARK_BG)
        canvas.rect(0, PAGE_H - 110*mm, PAGE_W, 110*mm, fill=1, stroke=0)
        # Red accent stripe
        canvas.setFillColor(RED)
        canvas.rect(0, PAGE_H - 113*mm, PAGE_W, 3*mm, fill=1, stroke=0)
        # Green bottom stripe
        canvas.setFillColor(GREEN)
        canvas.rect(0, 0, PAGE_W, 4*mm, fill=1, stroke=0)
        canvas.restoreState()

    # Cover content (will be placed at top via story)
    story.append(Spacer(1, 28*mm))
    story.append(Paragraph("JIGAWA STATE INTER-SCHOOL", COVER_TITLE))
    story.append(Paragraph("SPELLING BEE CHAMPIONSHIP", COVER_TITLE))
    story.append(Spacer(1, 4))
    story.append(Paragraph("System Upgrade — Feature Review Document", COVER_SUB))
    story.append(Paragraph("Version 2.0", COVER_SUB))
    story.append(Spacer(1, 22*mm))

    meta_data = [
        ["Prepared by:", "KowaguruTech Engineering Team"],
        ["Organized by:", "J-YEDA (Youth Educational Empowerment Association)"],
        ["Sponsored by:", "Jigawa State Ministry of Education"],
        ["Date:", datetime.date.today().strftime("%d %B %Y")],
        ["Document Status:", "For CEO Review & Approval"],
    ]
    meta_tbl = Table(meta_data, colWidths=[5*cm, 10*cm])
    meta_tbl.setStyle(TableStyle([
        ("FONTNAME",  (0,0), (0,-1), "Helvetica-Bold"),
        ("FONTNAME",  (1,0), (1,-1), "Helvetica"),
        ("FONTSIZE",  (0,0), (-1,-1), 9.5),
        ("TEXTCOLOR", (0,0), (0,-1), RED),
        ("TEXTCOLOR", (1,0), (1,-1), BLACK),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ("TOPPADDING",    (0,0), (-1,-1), 6),
        ("LINEBELOW",     (0,0), (-1,-2), 0.3, GREY_MID),
    ]))
    story.append(meta_tbl)
    story.append(Spacer(1, 50*mm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=GREY_MID))
    story.append(Spacer(1, 4))
    story.append(Paragraph(
        "This document is a confidential technical feature review prepared by KowaguruTech for "
        "internal CEO review. It outlines all approved system changes requested by the J-YEDA "
        "association following the live test session of the Jigawa Spelling Bee Web System.",
        NOTE_BOX))

    # PAGE BREAK
    from reportlab.platypus import PageBreak
    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════════
    # SECTION 1 — EXECUTIVE SUMMARY
    # ══════════════════════════════════════════════════════════════════════════
    story.append(ColorBanner("1.  EXECUTIVE SUMMARY"))
    story.append(BIG_SP)
    story.append(Paragraph(
        "Following the successful live test of the Jigawa Spelling Bee Championship Web System "
        "with J-YEDA association members and the KowaguruTech team, a set of critical upgrades "
        "were identified and agreed upon. This document captures every requested change in "
        "precise technical and operational terms for CEO review and sign-off before development "
        "begins.", BODY))
    story.append(SP)
    story.append(Paragraph(
        "The upgrade transitions the system from a <b>fixed-round scoring format</b> to a "
        "<b>flexible stage-based championship</b> with advanced features including automatic "
        "timer-driven validation, decision locking and reversal, a dedicated tiebreaker "
        "dashboard, and real-time audience mark display.", BODY))
    story.append(BIG_SP)

    # Summary table
    story.append(Paragraph("Change Summary at a Glance", SUBSEC_HEAD))
    glance_rows = [
        ["Terminology", "All 'Rounds' renamed to 'Stages' across every screen and database"],
        ["Stage Structure", "4 stages: 18 → 10 → 5 → 3 students (manual judge-controlled advancement)"],
        ["Marking System", "25 marks per correct word; fresh marks every stage"],
        ["Attempts", "Unlimited per stage; judge sets words-per-student limit per stage"],
        ["Timer Auto-Validation", "Timer expiry triggers automatic Correct/Incorrect based on spelling input"],
        ["Decision Lock", "Correct/Incorrect buttons lock after one click to prevent duplicates"],
        ["Decision Reversal", "Judge can reverse any decision in the current stage from a history panel"],
        ["Tiebreaker Dashboard", "New dedicated page (/tiebreaker) for sudden-death tie-break rounds"],
        ["Speller Monitor", "Updates immediately when 'Next Speller' is clicked — no timer wait"],
        ["Audience Screen", "No premature 'OUT' labels; shows live Attempted + Marks feed"],
        ["Stage End Flow", "System calculates rankings → judge reviews summary → confirms advancement"],
    ]
    story.append(make_table(
        ["Feature", "Change Description"],
        glance_rows,
        col_widths=[4.5*cm, 12.5*cm]
    ))
    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════════
    # SECTION 2 — STAGE STRUCTURE
    # ══════════════════════════════════════════════════════════════════════════
    story.append(ColorBanner("2.  STAGE STRUCTURE & QUALIFICATION LOGIC"))
    story.append(BIG_SP)
    story.append(Paragraph(
        "The competition is restructured into four distinct stages. Each stage begins with "
        "a fresh mark tally (no carry-over from previous stages). Advancement is determined "
        "by mark ranking, with the judge manually confirming who advances at the end of each stage.",
        BODY))
    story.append(BIG_SP)

    stage_rows = [
        ["Stage 1\n(Qualification)", "18", "10 advance\n8 dropped", "Top 10 by marks",
         "Each student spells N words\n(judge sets N)"],
        ["Stage 2\n(Quarter-Final)", "10", "5 advance\n5 dropped", "Top 5 by marks",
         "Each student spells N words\n(judge sets N)"],
        ["Stage 3\n(Semi-Final)", "5", "3 advance\n2 dropped", "Top 3 by marks",
         "Each student spells N words\n(judge sets N)"],
        ["Stage 4\n(Final / Knockout)", "3", "Champion + 1st\n& 2nd Runner-up",
         "Sudden Death\n(miss = out)", "Continues until\nstandings are clear"],
    ]
    tbl = Table(
        [["Stage", "Starts\nWith", "Result", "Advancement\nCriteria", "Word Allocation"]] + stage_rows,
        colWidths=[3.2*cm, 2*cm, 3*cm, 3.8*cm, 4*cm],
        repeatRows=1
    )
    tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,0), RED_DARK),
        ("TEXTCOLOR",     (0,0), (-1,0), WHITE),
        ("FONTNAME",      (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE",      (0,0), (-1,0), 9),
        ("BACKGROUND",    (0,1), (-1,1), colors.HexColor("#fff0f0")),
        ("BACKGROUND",    (0,2), (-1,2), GREY_BG),
        ("BACKGROUND",    (0,3), (-1,3), colors.HexColor("#fff0f0")),
        ("BACKGROUND",    (0,4), (-1,4), colors.HexColor("#f0fff0")),
        ("FONTNAME",      (0,1), (-1,-1), "Helvetica"),
        ("FONTSIZE",      (0,1), (-1,-1), 8.5),
        ("GRID",          (0,0), (-1,-1), 0.5, GREY_MID),
        ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
        ("ALIGN",         (1,0), (1,-1), "CENTER"),
        ("BOTTOMPADDING", (0,0), (-1,-1), 7),
        ("TOPPADDING",    (0,0), (-1,-1), 7),
        ("FONTNAME",      (0,1), (0,-1), "Helvetica-Bold"),
        ("TEXTCOLOR",     (0,1), (0,-1), RED_DARK),
    ]))
    story.append(tbl)
    story.append(BIG_SP)

    story.append(Paragraph("Key Rules", SUBSEC_HEAD))
    for bullet in [
        "Marks reset to zero at the start of every stage — previous stage performance has no effect.",
        "The judge configures the number of words per student per stage in the cockpit settings before or during the stage.",
        "Attempts per student within a stage are unlimited — the judge manually cycles through students, and the system enforces no automatic cap.",
        "Students are never marked as eliminated mid-stage. Elimination only occurs after the judge confirms the stage-end summary.",
        "Stage 4 (Final) operates as Sudden Death — a wrong answer immediately eliminates the student. Final positions (1st, 2nd, 3rd) are determined in this stage.",
    ]:
        story.append(Paragraph(bullet, BULLET))

    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════════
    # SECTION 3 — MARKING SYSTEM
    # ══════════════════════════════════════════════════════════════════════════
    story.append(ColorBanner("3.  MARKING SYSTEM"))
    story.append(BIG_SP)

    mark_rows = [
        ["Correct spelling", "25 marks"],
        ["Incorrect spelling", "0 marks"],
        ["Auto-marked (timer expired, correct)", "25 marks"],
        ["Auto-marked (timer expired, incorrect)", "0 marks"],
        ["Reversed decision (Correct → Incorrect)", "-25 marks from student total"],
        ["Reversed decision (Incorrect → Correct)", "+25 marks to student total"],
    ]
    story.append(make_table(
        ["Event", "Mark Awarded"],
        mark_rows,
        col_widths=[10*cm, 7*cm]
    ))
    story.append(BIG_SP)
    story.append(Paragraph(
        "The system replaces the previous 10-points-per-word model. All four stages use "
        "25 marks per correct word. The Final stage (Sudden Death) still records marks for "
        "transparency but advancement is based purely on whether the student spells correctly "
        "or not.", BODY))

    story.append(BIG_SP)

    # ══════════════════════════════════════════════════════════════════════════
    # SECTION 4 — TIMER AUTO-VALIDATION
    # ══════════════════════════════════════════════════════════════════════════
    story.append(ColorBanner("4.  TIMER AUTO-VALIDATION"))
    story.append(BIG_SP)
    story.append(Paragraph(
        "When the countdown timer reaches zero while a student is actively spelling, the "
        "system automatically evaluates the spelling entered and records the result — "
        "no judge button click required.", BODY))
    story.append(BIG_SP)

    flow_data = [
        ["Step", "Action", "Who"],
        ["1", "Timer reaches 0:00", "System (automatic)"],
        ["2", "System compares typed letters with the target word\n(case-insensitive, punctuation stripped)", "System (automatic)"],
        ["3", "If match → fires MARK CORRECT (25 marks)", "System (automatic)"],
        ["4", "If no match → fires MARK INCORRECT (0 marks)", "System (automatic)"],
        ["5", "Result displayed on all screens instantly", "System (automatic)"],
        ["6", "Judge clicks 'Next Speller' to continue", "Judge"],
    ]
    story.append(make_table(
        flow_data[0], flow_data[1:],
        col_widths=[1.5*cm, 11*cm, 4.5*cm]
    ))
    story.append(BIG_SP)
    story.append(Paragraph(
        "Note: If the judge has already clicked Correct or Incorrect before the timer "
        "reaches zero, the auto-validation does not fire — the manual decision takes priority.",
        NOTE_BOX))

    story.append(BIG_SP)

    # ══════════════════════════════════════════════════════════════════════════
    # SECTION 5 — DECISION LOCK & REVERSAL
    # ══════════════════════════════════════════════════════════════════════════
    story.append(ColorBanner("5.  DECISION LOCK & REVERSAL SYSTEM"))
    story.append(BIG_SP)

    story.append(Paragraph("5.1  One-Click Lock", SUBSEC_HEAD))
    story.append(Paragraph(
        "To prevent accidental double-clicks and duplicate scores, the Correct and Incorrect "
        "buttons on the judge cockpit are locked immediately after a single click.", BODY))
    story.append(SP)
    for b in [
        "Both buttons are greyed out and disabled the moment one is clicked.",
        "A visual badge shows the recorded result (e.g. '✔ Correct — 25 marks recorded').",
        "The lock is cleared automatically when the judge clicks 'Next Speller'.",
        "Auto-validation (timer expiry) also triggers the lock.",
    ]:
        story.append(Paragraph(b, BULLET))

    story.append(BIG_SP)
    story.append(Paragraph("5.2  Decision Reversal Panel", SUBSEC_HEAD))
    story.append(Paragraph(
        "A collapsible 'Reversal / Decision History' panel is available on the judge cockpit. "
        "This panel allows the judge to review and correct any decision made within the "
        "current stage.", BODY))
    story.append(SP)
    for b in [
        "Displays a full chronological list of all decisions in the current stage.",
        "Each entry shows: Student Name, Word, Decision (Correct / Incorrect), Marks, Time.",
        "Each entry has a '↩ Reverse' button.",
        "Reversing a decision: removes the history record, adjusts the student's mark total, and immediately broadcasts the updated state to all screens.",
        "Any decision in the current stage can be reversed — not limited to the most recent.",
        "Reversed decisions are logged for audit purposes.",
    ]:
        story.append(Paragraph(b, BULLET))

    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════════
    # SECTION 6 — STAGE END FLOW
    # ══════════════════════════════════════════════════════════════════════════
    story.append(ColorBanner("6.  STAGE END FLOW — MANUAL WITH CONFIRMATION"))
    story.append(BIG_SP)
    story.append(Paragraph(
        "The judge controls when a stage ends. There is no automatic end trigger. "
        "The flow is designed to give the judge full control and visibility before "
        "any students are advanced or eliminated.", BODY))
    story.append(BIG_SP)

    end_flow = [
        ["1", "Judge clicks 'End Stage' button in the cockpit"],
        ["2", "System calculates mark rankings for all students in the current stage"],
        ["3", "A Stage Summary Modal appears — showing a full ranked table with colour coding:\n"
              "   ● Green = Advances to next stage\n"
              "   ● Red = Dropped / Eliminated\n"
              "   ● Orange = Tied at cutoff (tiebreaker required)"],
        ["4", "If a tie exists at the cutoff point, a '⚠ Tiebreaker Required' alert is shown\n"
              "   with a button to open the Tiebreaker Dashboard"],
        ["5", "Judge reviews the summary and clicks 'Confirm & Advance'"],
        ["6", "System marks dropped students as eliminated, resets advancing students' marks to 0,\n"
              "   moves competition to the next stage, and broadcasts to all screens"],
    ]
    tbl2 = Table([["Step", "Action"]] + end_flow, colWidths=[1.5*cm, 15.5*cm], repeatRows=1)
    tbl2.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,0), RED_DARK),
        ("TEXTCOLOR",     (0,0), (-1,0), WHITE),
        ("FONTNAME",      (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE",      (0,0), (-1,-1), 9),
        ("FONTNAME",      (0,1), (-1,-1), "Helvetica"),
        ("FONTNAME",      (0,1), (0,-1), "Helvetica-Bold"),
        ("TEXTCOLOR",     (0,1), (0,-1), RED),
        ("ALIGN",         (0,0), (0,-1), "CENTER"),
        ("VALIGN",        (0,0), (-1,-1), "TOP"),
        ("GRID",          (0,0), (-1,-1), 0.5, GREY_MID),
        ("BOTTOMPADDING", (0,0), (-1,-1), 8),
        ("TOPPADDING",    (0,0), (-1,-1), 8),
        ("BACKGROUND",    (0,2), (-1,2), GREY_BG),
        ("BACKGROUND",    (0,4), (-1,4), GREY_BG),
    ]))
    story.append(tbl2)
    story.append(BIG_SP)

    # ══════════════════════════════════════════════════════════════════════════
    # SECTION 7 — TIEBREAKER DASHBOARD
    # ══════════════════════════════════════════════════════════════════════════
    story.append(ColorBanner("7.  TIEBREAKER / ADDITIONAL KNOCKOUT DASHBOARD"))
    story.append(BIG_SP)
    story.append(Paragraph(
        "When two or more students are tied at the qualification cutoff at the end of a stage, "
        "a dedicated Tiebreaker Dashboard is used to resolve the tie before advancement is "
        "confirmed.", BODY))
    story.append(BIG_SP)

    tb_rows = [
        ["Access", "New button in judge cockpit navigation bar:\n'⚡ Open Tiebreaker'\n"
                   "(alongside Open Projector, Open Speller, Open Leaderboard)"],
        ["Page URL", "/tiebreaker — a dedicated full-screen page"],
        ["Word Bank", "Reserved words Q401–Q500 are used exclusively for tiebreakers"],
        ["Format", "Sudden Death Knockout — miss a word → immediately eliminated from the tie"],
        ["Students", "Judges select which tied students participate in the tiebreaker"],
        ["Outcome", "Last student(s) remaining fill the available advancement slots; "
                    "result feeds back automatically into the main competition state"],
        ["Display", "Has its own timer, pronouncer card, and Correct/Incorrect buttons — "
                    "identical in layout to the main judge cockpit"],
    ]
    story.append(make_table(
        ["Item", "Detail"],
        tb_rows,
        col_widths=[3.5*cm, 13.5*cm]
    ))

    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════════
    # SECTION 8 — AUDIENCE / PROJECTOR SCREEN
    # ══════════════════════════════════════════════════════════════════════════
    story.append(ColorBanner("8.  AUDIENCE / PROJECTOR SCREEN IMPROVEMENTS"))
    story.append(BIG_SP)

    story.append(Paragraph("8.1  No Premature Elimination Labels", SUBSEC_HEAD))
    story.append(Paragraph(
        "Previously, a student was shown as 'OUT' immediately after missing a single word. "
        "This is removed. No student is labelled as eliminated until the judge has confirmed "
        "the stage-end summary.", BODY))
    story.append(SP)
    for b in [
        "During an active stage: all participating students show status as 'Competing'.",
        "After stage confirmation: dropped students show 'Stage X — Eliminated'.",
        "Advanced students show 'Advanced to Stage X+1'.",
    ]:
        story.append(Paragraph(b, BULLET))

    story.append(BIG_SP)
    story.append(Paragraph("8.2  Live Attempted & Marks Feed", SUBSEC_HEAD))
    story.append(Paragraph(
        "A live-updating results feed replaces the previous static round-history panel. "
        "This feed shows the audience each student's running performance within the "
        "current stage.", BODY))
    story.append(BIG_SP)

    feed_rows = [
        ["Student Name", "School", "Words Attempted", "Marks", "Status"],
        ["Humaira Sani", "MBPS Gumel", "3", "75", "Competing"],
        ["Ahmad Usman", "Mega School Dutse", "2", "50", "Competing"],
        ["Zainab Yahaya", "Mega School Dutse", "2", "25", "Competing"],
        ["Musa Yakubu", "MBPS Bulangu", "1", "0", "Competing"],
        ["...", "...", "...", "...", "..."],
    ]
    feed_tbl = Table(feed_rows, colWidths=[4*cm, 4.5*cm, 3*cm, 2.5*cm, 3*cm], repeatRows=1)
    feed_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,0), GREEN),
        ("TEXTCOLOR",     (0,0), (-1,0), WHITE),
        ("FONTNAME",      (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE",      (0,0), (-1,-1), 8.5),
        ("FONTNAME",      (0,1), (-1,-1), "Helvetica"),
        ("GRID",          (0,0), (-1,-1), 0.5, GREY_MID),
        ("ALIGN",         (2,0), (3,-1), "CENTER"),
        ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("TOPPADDING",    (0,0), (-1,-1), 5),
        ("BACKGROUND",    (0,2), (-1,2), GREY_BG),
        ("BACKGROUND",    (0,4), (-1,4), GREY_BG),
    ]))
    story.append(feed_tbl)
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        "Example layout of the live Attempted & Marks feed visible on the audience projector screen.",
        NOTE_BOX))

    story.append(BIG_SP)

    # ══════════════════════════════════════════════════════════════════════════
    # SECTION 9 — SPELLER MONITOR IMPROVEMENT
    # ══════════════════════════════════════════════════════════════════════════
    story.append(ColorBanner("9.  SPELLER MONITOR — IMMEDIATE NEXT SPELLER UPDATE"))
    story.append(BIG_SP)
    story.append(Paragraph(
        "The Speller Monitor screen (displayed downstage for the contestant to see) "
        "currently only updates when the judge starts the timer. This creates a gap "
        "where the screen shows the previous contestant's information.", BODY))
    story.append(BIG_SP)

    comp_data = [
        ["", "Current Behaviour", "New Behaviour (v2)"],
        ["Trigger for update", "Timer Start button clicked", "'Next Speller' button clicked"],
        ["What audience sees", "Previous contestant's info until timer starts",
         "New contestant's name, school, and stage immediately"],
        ["Timer display", "Starts counting when judge clicks Start",
         "Shows timer in 'Ready' state (full duration, not ticking) immediately;\nstarts counting when judge clicks Start"],
    ]
    comp_tbl = Table(comp_data, colWidths=[3.5*cm, 5.5*cm, 7*cm], repeatRows=1)
    comp_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,0), RED_DARK),
        ("TEXTCOLOR",     (0,0), (-1,0), WHITE),
        ("FONTNAME",      (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE",      (0,0), (-1,-1), 9),
        ("FONTNAME",      (0,1), (-1,-1), "Helvetica"),
        ("FONTNAME",      (0,1), (0,-1), "Helvetica-Bold"),
        ("TEXTCOLOR",     (0,1), (0,-1), RED_DARK),
        ("GRID",          (0,0), (-1,-1), 0.5, GREY_MID),
        ("VALIGN",        (0,0), (-1,-1), "TOP"),
        ("BOTTOMPADDING", (0,0), (-1,-1), 7),
        ("TOPPADDING",    (0,0), (-1,-1), 7),
        ("BACKGROUND",    (0,2), (-1,2), GREY_BG),
    ]))
    story.append(comp_tbl)

    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════════
    # SECTION 10 — FILES TO MODIFY
    # ══════════════════════════════════════════════════════════════════════════
    story.append(ColorBanner("10.  TECHNICAL — FILES TO BE MODIFIED"))
    story.append(BIG_SP)

    files_rows = [
        ["db/schema.sql", "Add decision_locked, stage_word_limit columns; rename round → stage"],
        ["db/index.js", "Update getFullState(); STAGE_RULES; 25 pts/word"],
        ["server.js", "New endpoints: /api/stage/end, /api/stage/confirm-advance,\n"
                      "/api/decision/reverse. Auto-timer validation. Decision lock logic."],
        ["public/judge.html", "Stage labels; words-per-student input; lock buttons; reversal panel;\n"
                              "End Stage button; confirmation modal; Tiebreaker nav button"],
        ["public/projector.html", "Attempted+Marks feed; no mid-stage OUT labels; Stage labels"],
        ["public/speller.html", "Immediate update on Next Speller click"],
        ["public/leaderboard.html", "Stage labels"],
        ["public/tiebreaker.html", "NEW PAGE — Complete Tiebreaker Knockout Dashboard"],
    ]
    story.append(make_table(
        ["File", "Changes"],
        files_rows,
        col_widths=[4.5*cm, 12.5*cm]
    ))
    story.append(BIG_SP)

    story.append(Paragraph("Implementation Order", SUBSEC_HEAD))
    for i, step in enumerate([
        "DB Schema — add new columns (no breaking changes to existing data)",
        "db/index.js — update getFullState(), marks, stage rules",
        "server.js — new endpoints, timer auto-validation, decision lock",
        "public/judge.html — UI updates (stages, word-limit, lock, reversal, End Stage modal)",
        "public/speller.html — immediate Next Speller update",
        "public/projector.html — Attempted+Marks feed, stage labels",
        "public/tiebreaker.html — New page",
        "public/leaderboard.html — Stage label updates",
        "End-to-end test of full competition flow",
    ], 1):
        story.append(Paragraph(f"{i}.  {step}", BULLET))

    story.append(BIG_SP)

    # ══════════════════════════════════════════════════════════════════════════
    # SECTION 11 — APPROVAL
    # ══════════════════════════════════════════════════════════════════════════
    story.append(ColorBanner("11.  REVIEW & APPROVAL"))
    story.append(BIG_SP)
    story.append(Paragraph(
        "Please review all sections of this document and confirm your approval before "
        "development begins. All features listed are based on the test session feedback "
        "from J-YEDA and the KowaguruTech team.", BODY))
    story.append(BIG_SP)

    approval_data = [
        ["Name", "Role", "Signature", "Date"],
        ["", "KowaguruTech CEO", "", ""],
        ["", "J-YEDA Representative", "", ""],
        ["", "KowaguruTech Lead Engineer", "", ""],
    ]
    appr_tbl = Table(approval_data, colWidths=[5*cm, 5*cm, 4*cm, 3*cm], repeatRows=1)
    appr_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,0), DARK_BG),
        ("TEXTCOLOR",     (0,0), (-1,0), WHITE),
        ("FONTNAME",      (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE",      (0,0), (-1,-1), 9),
        ("FONTNAME",      (0,1), (-1,-1), "Helvetica"),
        ("GRID",          (0,0), (-1,-1), 0.5, GREY_MID),
        ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
        ("BOTTOMPADDING", (0,0), (-1,-1), 20),
        ("TOPPADDING",    (0,0), (-1,-1), 8),
        ("BACKGROUND",    (0,2), (-1,2), GREY_BG),
    ]))
    story.append(appr_tbl)
    story.append(BIG_SP)

    # ── Footer note ───────────────────────────────────────────────────────────
    story.append(HRFlowable(width="100%", thickness=0.5, color=GREY_MID))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        f"Jigawa State Inter-School Spelling Bee Championship  •  System v2.0 Feature Review  •  "
        f"Prepared by KowaguruTech  •  {datetime.date.today().strftime('%d %B %Y')}",
        FOOTER_STYLE))

    # ── Build ─────────────────────────────────────────────────────────────────
    def on_page(canvas, doc):
        canvas.saveState()
        # Top bar on all pages except cover
        if doc.page > 1:
            canvas.setFillColor(DARK_BG)
            canvas.rect(0, PAGE_H - 18*mm, PAGE_W, 18*mm, fill=1, stroke=0)
            canvas.setFillColor(RED)
            canvas.rect(0, PAGE_H - 19.5*mm, PAGE_W, 1.5*mm, fill=1, stroke=0)
            canvas.setFillColor(WHITE)
            canvas.setFont("Helvetica-Bold", 8)
            canvas.drawString(2*cm, PAGE_H - 11*mm, "JIGAWA SPELLING BEE — v2 FEATURE REVIEW")
            canvas.setFont("Helvetica", 8)
            canvas.drawRightString(PAGE_W - 2*cm, PAGE_H - 11*mm,
                                   f"Page {doc.page}  |  CONFIDENTIAL — KowaguruTech")

        # Bottom green stripe
        canvas.setFillColor(GREEN)
        canvas.rect(0, 0, PAGE_W, 3*mm, fill=1, stroke=0)
        canvas.restoreState()

    doc.build(story, onFirstPage=cover_page, onLaterPages=on_page)
    print(f"PDF generated: {OUTPUT}")

build_pdf()
