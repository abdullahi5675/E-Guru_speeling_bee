import os
import sys
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, HRFlowable
)
from reportlab.pdfgen import canvas

# Brand Palette: Red, Green, Black, Slate
COLOR_HEADER_BG = colors.HexColor('#0c1410')
COLOR_CARD_BG = colors.HexColor('#f8fafc')
COLOR_RED = colors.HexColor('#cc1b1b')
COLOR_GREEN = colors.HexColor('#1a7a1a')
COLOR_DARK = colors.HexColor('#0f172a')
COLOR_MUTED = colors.HexColor('#475569')
COLOR_BORDER = colors.HexColor('#cbd5e1')
COLOR_GOLD = colors.HexColor('#b45309')

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_number(num_pages)
            canvas.Canvas.showPage(self)
        canvas.Canvas.save(self)

    def draw_page_number(self, page_count):
        self.saveState()
        self.setFont("Helvetica-Bold", 7.5)
        self.setFillColor(COLOR_MUTED)
        
        # Header (pages > 1)
        if self._pageNumber > 1:
            self.drawString(40, 11 * inch - 30, "Jigawa State Spelling Bee Championship • System Architecture & Operations Briefing")
            self.setStrokeColor(colors.HexColor('#e2e8f0'))
            self.setLineWidth(0.5)
            self.line(40, 11 * inch - 34, 8.5 * inch - 40, 11 * inch - 34)
        
        # Footer
        footer_text = f"Page {self._pageNumber} of {page_count}  •  Prepared by KowaguruTech for J-YEDA & Jigawa State MOE"
        self.drawRightString(8.5 * inch - 40, 24, footer_text)
        self.drawString(40, 24, "CONFIDENTIAL — OFFICIAL TOURNAMENT MANAGEMENT DOCUMENT")
        self.setStrokeColor(colors.HexColor('#e2e8f0'))
        self.setLineWidth(0.5)
        self.line(40, 32, 8.5 * inch - 40, 32)
        self.restoreState()

def create_pdf(filename="Jigawa_Spelling_Bee_System_Architecture_Briefing.pdf"):
    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        leftMargin=40,
        rightMargin=40,
        topMargin=40,
        bottomMargin=38
    )

    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=15.5,
        leading=19,
        textColor=COLOR_RED,
        spaceAfter=2
    )

    subtitle_style = ParagraphStyle(
        'DocSubTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9.5,
        leading=12.5,
        textColor=COLOR_GREEN,
        spaceAfter=6
    )

    h1_style = ParagraphStyle(
        'Heading1_Custom',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10.5,
        leading=13.5,
        textColor=COLOR_DARK,
        spaceBefore=7,
        spaceAfter=3,
        keepWithNext=True
    )

    body_style = ParagraphStyle(
        'Body_Custom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.8,
        leading=10.8,
        textColor=COLOR_DARK,
        spaceAfter=3
    )

    meta_style = ParagraphStyle(
        'Meta_Custom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.5,
        leading=10,
        textColor=COLOR_MUTED
    )

    table_header_style = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7.5,
        leading=9.5,
        textColor=colors.white,
        alignment=1
    )

    table_cell_style = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.2,
        leading=9.2,
        textColor=COLOR_DARK
    )

    table_cell_center = ParagraphStyle(
        'TableCellCenter',
        parent=table_cell_style,
        alignment=1
    )

    story = []

    # =========================================================================
    # PAGE 1: TITLE, EXECUTIVE SUMMARY & TOURNAMENT RULES
    # =========================================================================
    story.append(Paragraph("JIGAWA STATE INTER-SCHOOL SPELLING BEE CHAMPIONSHIP", title_style))
    story.append(Paragraph("OFFICIAL SYSTEM ARCHITECTURE & TOURNAMENT OPERATIONS BRIEFING", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=COLOR_RED, spaceBefore=0, spaceAfter=6))

    # Stakeholders Table
    stakeholders_data = [
        [
            Paragraph("<b>SPONSOR</b><br/>Jigawa State Government<br/><font color='#475569'>Ministry of Education</font>", meta_style),
            Paragraph("<b>ORGANIZER</b><br/>J-YEDA<br/><font color='#475569'>Youth Educational Assoc.</font>", meta_style),
            Paragraph("<b>DEVELOPER</b><br/>KowaguruTech Company<br/><font color='#475569'>Lead Engineering Team</font>", meta_style),
            Paragraph("<b>PROJECT LEAD</b><br/>Aliyu Yahaya Masset<br/><font color='#475569'>Competition Operations</font>", meta_style)
        ]
    ]
    t_stakeholders = Table(stakeholders_data, colWidths=[133, 133, 133, 133])
    t_stakeholders.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f1f5f9')),
        ('BOX', (0,0), (-1,-1), 0.5, COLOR_BORDER),
        ('INNERGRID', (0,0), (-1,-1), 0.5, COLOR_BORDER),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t_stakeholders)
    story.append(Spacer(1, 4))

    # Section 1: Executive Summary
    story.append(Paragraph("1. Executive Summary & Platform Overview", h1_style))
    exec_text = (
        "This official briefing details the enterprise web application engineered by <b>KowaguruTech</b> for the "
        "<b>Jigawa State Inter-School Spelling Bee Championship</b>, sponsored by the <b>Jigawa State Ministry of Education</b> "
        "and organized by <b>J-YEDA</b>. Built with Node.js, Socket.IO WebSockets, and a robust PostgreSQL 18 database, "
        "the ecosystem eliminates paper scorekeeping with synchronized real-time screens across the auditorium. "
        "The system operates 100% offline across hall Wi-Fi, providing instant scoring, automated qualification checks, and strict audit integrity."
    )
    story.append(Paragraph(exec_text, body_style))
    story.append(Spacer(1, 4))

    # Section 2: Tournament Stages & Math
    story.append(Paragraph("2. Official Tournament Stages & Mathematical Progression", h1_style))
    rules_text = (
        "In accordance with official directives from Project Lead <b>Aliyu Yahaya Masset</b>, the tournament is executed "
        "across <b>four qualification stages</b> and a <b>reserve pool</b>. The system strictly monitors speller attempts and enforces advancement thresholds:"
    )
    story.append(Paragraph(rules_text, body_style))
    story.append(Spacer(1, 4))

    stages_data = [
        [
            Paragraph("Stage", table_header_style),
            Paragraph("Word Range", table_header_style),
            Paragraph("Words / Speller", table_header_style),
            Paragraph("Total Word Math", table_header_style),
            Paragraph("Advancement / Elimination Rule", table_header_style)
        ],
        [
            Paragraph("<b>Round 1<br/>(First Round)</b>", table_cell_style),
            Paragraph("Q1 – Q100<br/><i>Simplest Tier</i>", table_cell_center),
            Paragraph("4 Words", table_cell_center),
            Paragraph("18 × 4 = <b>72 words</b>", table_cell_center),
            Paragraph("Must score <b>≥ 3 correct out of 4</b> to advance to Round 2. Contestants with &lt; 3 correct are eliminated from progression.", table_cell_style)
        ],
        [
            Paragraph("<b>Round 2<br/>(Second Round)</b>", table_cell_style),
            Paragraph("Q101 – Q200<br/><i>Intermediate</i>", table_cell_center),
            Paragraph("3 Words", table_cell_center),
            Paragraph("18 × 3 = <b>54 words</b>", table_cell_center),
            Paragraph("Must score <b>≥ 2 correct out of 3</b> to advance to the Semi-Final. Contestants with &lt; 2 correct are eliminated.", table_cell_style)
        ],
        [
            Paragraph("<b>Round 3<br/>(Semi-Final)</b>", table_cell_style),
            Paragraph("Q201 – Q300<br/><i>Advanced</i>", table_cell_center),
            Paragraph("3 Words", table_cell_center),
            Paragraph("18 × 3 = <b>54 words</b>", table_cell_center),
            Paragraph("<b>100% Accuracy Required:</b> Contestants must answer <b>ALL 3 words correct</b> to qualify for the Championship Final.", table_cell_style)
        ],
        [
            Paragraph("<b>Round 4<br/>(Final Round)</b>", table_cell_style),
            Paragraph("Q301 – Q400<br/><i>Championship</i>", table_cell_center),
            Paragraph("Sudden Death<br/>(2 Words Base)", table_cell_center),
            Paragraph("18 × 2 = <b>36 words</b>", table_cell_center),
            Paragraph("<b>Sudden Death Knockout:</b> 'Spell & stay • Misspell & go.' The last remaining uneliminated contestant is crowned Champion.", table_cell_style)
        ],
        [
            Paragraph("<b>Reserve Pool<br/>(Tie-Breakers)</b>", table_cell_style),
            Paragraph("Q401 – Q500<br/><i>Master Tier</i>", table_cell_center),
            Paragraph("1 Word per trial", table_cell_center),
            Paragraph("<b>100 Reserve words</b>", table_cell_center),
            Paragraph("If all finalists fail in a cycle, single-word trials continue from the 100 reserve words until the champion is ascertained.", table_cell_style)
        ]
    ]

    t_stages = Table(stages_data, colWidths=[80, 85, 85, 95, 187])
    t_stages.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), COLOR_RED),
        ('ALIGN', (0,0), (-1,0), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('GRID', (0,0), (-1,-1), 0.5, COLOR_BORDER),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f8fafc')]),
        ('TOPPADDING', (0,0), (-1,-1), 3.5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3.5),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(t_stages)
    story.append(Spacer(1, 6))

    # Section 3: Word Bank Summary
    story.append(Paragraph("3. Official 500-Word Bank Architecture", h1_style))
    word_text = (
        "The official J-YEDA competition list (<b>500 words</b>) extracted from <i>'Jigawa Spelling Bee JSS 500 Words 4 Rounds.pdf'</i> "
        "has been permanently loaded into PostgreSQL. It includes phonetic guides, parts of speech, and curriculum subjects "
        "(English, Mathematics, Basic Science, Agriculture, Digital Technology, Business Studies, Social Studies, Arts, etc.). "
        "<b>Per user specification, all screens display only the active round's questions (100 per round) rather than an overwhelming 500-word wall.</b>"
    )
    story.append(Paragraph(word_text, body_style))

    # =========================================================================
    # PAGE 2: CONTESTANT ROSTER & SCREEN MODES
    # =========================================================================
    story.append(PageBreak())

    story.append(Paragraph("4. Participating Schools & Contestants Roster (18 Slots)", h1_style))
    roster_text = (
        "The competition includes <b>6 schools with 3 contestants each (18 total spellers)</b>. "
        "The 14 confirmed names are live in the database; 4 structured placeholders are primed for instant one-click updating "
        "as soon as field organizers transmit the remaining details:"
    )
    story.append(Paragraph(roster_text, body_style))
    story.append(Spacer(1, 4))

    roster_data = [
        [
            Paragraph("ID", table_header_style),
            Paragraph("Contestant Name", table_header_style),
            Paragraph("School Name", table_header_style),
            Paragraph("LGA / Zone", table_header_style),
            Paragraph("Category", table_header_style),
            Paragraph("Roster Status", table_header_style)
        ],
        [Paragraph("#001", table_cell_center), Paragraph("<b>Humaira Sani</b>", table_cell_style), Paragraph("MBPS Gumel", table_cell_style), Paragraph("Gumel", table_cell_center), Paragraph("JSS", table_cell_center), Paragraph("<font color='#16a34a'><b>Confirmed Active</b></font>", table_cell_center)],
        [Paragraph("#002", table_cell_center), Paragraph("<b>Khadija Lawan</b>", table_cell_style), Paragraph("MBPS Gumel", table_cell_style), Paragraph("Gumel", table_cell_center), Paragraph("JSS", table_cell_center), Paragraph("<font color='#16a34a'><b>Confirmed Active</b></font>", table_cell_center)],
        [Paragraph("#003", table_cell_center), Paragraph("<b>Adama Ya'u</b>", table_cell_style), Paragraph("MBPS Gumel", table_cell_style), Paragraph("Gumel", table_cell_center), Paragraph("JSS", table_cell_center), Paragraph("<font color='#16a34a'><b>Confirmed Active</b></font>", table_cell_center)],
        [Paragraph("#004", table_cell_center), Paragraph("<b>Musa Yakubu</b>", table_cell_style), Paragraph("MBPS Bulangu", table_cell_style), Paragraph("Bulangu", table_cell_center), Paragraph("JSS", table_cell_center), Paragraph("<font color='#16a34a'><b>Confirmed Active</b></font>", table_cell_center)],
        [Paragraph("#005", table_cell_center), Paragraph("<b>Ibrahim Yakubu</b>", table_cell_style), Paragraph("MBPS Bulangu", table_cell_style), Paragraph("Bulangu", table_cell_center), Paragraph("JSS", table_cell_center), Paragraph("<font color='#16a34a'><b>Confirmed Active</b></font>", table_cell_center)],
        [Paragraph("#006", table_cell_center), Paragraph("<b>Abdurrahid Muhammad</b>", table_cell_style), Paragraph("MBPS Bulangu", table_cell_style), Paragraph("Bulangu", table_cell_center), Paragraph("JSS", table_cell_center), Paragraph("<font color='#16a34a'><b>Confirmed Active</b></font>", table_cell_center)],
        [Paragraph("#007", table_cell_center), Paragraph("<b>Fatima Munkaila Alhassan</b>", table_cell_style), Paragraph("MBPS Kudai Dutse", table_cell_style), Paragraph("Dutse", table_cell_center), Paragraph("JSS", table_cell_center), Paragraph("<font color='#16a34a'><b>Confirmed Active</b></font>", table_cell_center)],
        [Paragraph("#008", table_cell_center), Paragraph("<b>Ummusalma Baffa</b>", table_cell_style), Paragraph("MBPS Kudai Dutse", table_cell_style), Paragraph("Dutse", table_cell_center), Paragraph("JSS", table_cell_center), Paragraph("<font color='#16a34a'><b>Confirmed Active</b></font>", table_cell_center)],
        [Paragraph("#009", table_cell_center), Paragraph("<b>Maimuna Muaazu</b>", table_cell_style), Paragraph("MBPS Kudai Dutse", table_cell_style), Paragraph("Dutse", table_cell_center), Paragraph("JSS", table_cell_center), Paragraph("<font color='#16a34a'><b>Confirmed Active</b></font>", table_cell_center)],
        [Paragraph("#010", table_cell_center), Paragraph("<b>Ummusalma Ya'u</b>", table_cell_style), Paragraph("Nomadic Dutse", table_cell_style), Paragraph("Dutse", table_cell_center), Paragraph("JSS", table_cell_center), Paragraph("<font color='#16a34a'><b>Confirmed Active</b></font>", table_cell_center)],
        [Paragraph("#011", table_cell_center), Paragraph("<b>Zuwairiyya Sulaiman Haruna</b>", table_cell_style), Paragraph("Nomadic Dutse", table_cell_style), Paragraph("Dutse", table_cell_center), Paragraph("JSS", table_cell_center), Paragraph("<font color='#16a34a'><b>Confirmed Active</b></font>", table_cell_center)],
        [Paragraph("#012", table_cell_center), Paragraph("<i>[Nomadic Speller 3]</i>", table_cell_style), Paragraph("Nomadic Dutse", table_cell_style), Paragraph("Dutse", table_cell_center), Paragraph("JSS", table_cell_center), Paragraph("<font color='#d97706'>Pending Name Update</font>", table_cell_center)],
        [Paragraph("#013", table_cell_center), Paragraph("<b>Ahmad Usman</b>", table_cell_style), Paragraph("Mega School Dutse", table_cell_style), Paragraph("Dutse", table_cell_center), Paragraph("JSS", table_cell_center), Paragraph("<font color='#16a34a'><b>Confirmed Active</b></font>", table_cell_center)],
        [Paragraph("#014", table_cell_center), Paragraph("<b>Zainab Yahaya</b>", table_cell_style), Paragraph("Mega School Dutse", table_cell_style), Paragraph("Dutse", table_cell_center), Paragraph("JSS", table_cell_center), Paragraph("<font color='#16a34a'><b>Confirmed Active</b></font>", table_cell_center)],
        [Paragraph("#015", table_cell_center), Paragraph("<b>Sakina Abdulaziz</b>", table_cell_style), Paragraph("Mega School Dutse", table_cell_style), Paragraph("Dutse", table_cell_center), Paragraph("JSS", table_cell_center), Paragraph("<font color='#16a34a'><b>Confirmed Active</b></font>", table_cell_center)],
        [Paragraph("#016", table_cell_center), Paragraph("<i>[Dangan Tsaure Speller 1]</i>", table_cell_style), Paragraph("JSS Dangan Tsaure", table_cell_style), Paragraph("Dutse", table_cell_center), Paragraph("JSS", table_cell_center), Paragraph("<font color='#d97706'>Pending Name Update</font>", table_cell_center)],
        [Paragraph("#017", table_cell_center), Paragraph("<i>[Dangan Tsaure Speller 2]</i>", table_cell_style), Paragraph("JSS Dangan Tsaure", table_cell_style), Paragraph("Dutse", table_cell_center), Paragraph("JSS", table_cell_center), Paragraph("<font color='#d97706'>Pending Name Update</font>", table_cell_center)],
        [Paragraph("#018", table_cell_center), Paragraph("<i>[Dangan Tsaure Speller 3]</i>", table_cell_style), Paragraph("JSS Dangan Tsaure", table_cell_style), Paragraph("Dutse", table_cell_center), Paragraph("JSS", table_cell_center), Paragraph("<font color='#d97706'>Pending Name Update</font>", table_cell_center)],
    ]

    t_roster = Table(roster_data, colWidths=[36, 150, 140, 66, 45, 95])
    t_roster.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), COLOR_DARK),
        ('ALIGN', (0,0), (-1,0), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('GRID', (0,0), (-1,-1), 0.5, COLOR_BORDER),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f8fafc')]),
        ('TOPPADDING', (0,0), (-1,-1), 2),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(t_roster)
    story.append(Spacer(1, 8))

    # Section 5: Screen Modes
    story.append(Paragraph("5. Synchronized Multi-Screen Environment", h1_style))
    screens_data = [
        [
            Paragraph("<b>👨‍⚖️ Judges & Pronouncer Cockpit (<code>/judge</code>)</b><br/>"
                      "Private console with Web Speech audio pronunciation, round-locked question picker (100 questions per round), "
                      "live attempt trackers (e.g. <i>'Attempt 1 of 4 • 3 needed'</i>), hotkeys (F5 pronounce, Space timer, Enter correct, Esc incorrect), and live roster tracking.", body_style)
        ],
        [
            Paragraph("<b>🖥️ Auditorium Stage Projector (<code>/projector</code>)</b><br/>"
                      "High-contrast stage view for spectators and dignitaries. Features official EGuru branding, active round banner, "
                      "giant 60s countdown circle, real-time live letter streaming, and instant GREEN / RED adjudication reveal banners.", body_style)
        ],
        [
            Paragraph("<b>🧑‍🎓 Speller Podium Monitor (<code>/speller</code>)</b><br/>"
                      "<b>1. Question Picker Mode:</b> Displays only the 100 question numbers for the active round. Speller taps their choice, which glows green and marks 'chosen' for them to announce to the judge.<br/>"
                      "<b>2. Active Turn Mode:</b> Displays full-screen timer, contestant info, and guidance (<i>'Spell your word clearly into the microphone'</i>).", body_style)
        ],
        [
            Paragraph("<b>🏆 Ministerial Leaderboard & School Rankings (<code>/leaderboard</code>)</b><br/>"
                      "Live score standings across contestants and schools. Includes printable attestation certificates and sign-off blocks.", body_style)
        ]
    ]
    t_screens = Table(screens_data, colWidths=[532])
    t_screens.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f8fafc')),
        ('BOX', (0,0), (-1,-1), 0.5, COLOR_BORDER),
        ('INNERGRID', (0,0), (-1,-1), 0.5, COLOR_BORDER),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t_screens)

    # =========================================================================
    # PAGE 3: NETWORK DEPLOYMENT, SUMMARY & SIGN-OFF
    # =========================================================================
    story.append(PageBreak())

    story.append(Paragraph("6. Auditorium Network Deployment & Wi-Fi Architecture", h1_style))
    net_text = (
        "The application is hosted on the primary operations laptop on port 3000. All auditorium laptops, tablets, "
        "and projector computers connect seamlessly over the venue's local Wi-Fi without needing an internet connection:"
    )
    story.append(Paragraph(net_text, body_style))
    story.append(Spacer(1, 4))

    net_table_data = [
        [Paragraph("Screen / Role", table_header_style), Paragraph("Local URL (Host Machine)", table_header_style), Paragraph("Auditorium Wi-Fi URL (Tablets / Laptops)", table_header_style)],
        [Paragraph("<b>Main Portal Hub</b>", table_cell_style), Paragraph("<code>http://localhost:3000/</code>", table_cell_style), Paragraph("<code>http://192.168.43.36:3000/</code>", table_cell_style)],
        [Paragraph("<b>Judges & Pronouncer Cockpit</b>", table_cell_style), Paragraph("<code>http://localhost:3000/judge</code>", table_cell_style), Paragraph("<code>http://192.168.43.36:3000/judge</code>", table_cell_style)],
        [Paragraph("<b>Stage Projector Screen</b>", table_cell_style), Paragraph("<code>http://localhost:3000/projector</code>", table_cell_style), Paragraph("<code>http://192.168.43.36:3000/projector</code>", table_cell_style)],
        [Paragraph("<b>Speller Podium Monitor</b>", table_cell_style), Paragraph("<code>http://localhost:3000/speller</code>", table_cell_style), Paragraph("<code>http://192.168.43.36:3000/speller</code>", table_cell_style)],
        [Paragraph("<b>Ministerial Leaderboard</b>", table_cell_style), Paragraph("<code>http://localhost:3000/leaderboard</code>", table_cell_style), Paragraph("<code>http://192.168.43.36:3000/leaderboard</code>", table_cell_style)],
    ]
    t_net = Table(net_table_data, colWidths=[152, 190, 190])
    t_net.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), COLOR_GREEN),
        ('ALIGN', (0,0), (-1,0), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('GRID', (0,0), (-1,-1), 0.5, COLOR_BORDER),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f8fafc')]),
        ('TOPPADDING', (0,0), (-1,-1), 3.5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3.5),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(t_net)
    story.append(Spacer(1, 8))

    # Section 7: Recent Upgrades
    story.append(Paragraph("7. Key Engineering Upgrades Delivered in this Version", h1_style))
    upgrades_data = [
        [
            Paragraph("• <b>Round-Isolated Question Grid:</b> Replaced the full 500-word grid with round-specific 100-question views. In Round 1, spellers see strictly Questions 1–100. In Round 2, Questions 101–200, and so forth.", body_style)
        ],
        [
            Paragraph("• <b>Automated Progression Engine:</b> System enforces multi-attempt qualification rules (Round 1: 4 words, 3 to pass; Round 2: 3 words, 2 to pass; Semi-Final: 3 words, 3 to pass; Final: Sudden Death).", body_style)
        ],
        [
            Paragraph("• <b>Official EGuru & KowaguruTech Palette:</b> Re-themed into Championship Red (`#cc1b1b`), Ebony Black (`#060808`), and Emerald Green (`#1a7a1a`) with the cartoon bee mascot logo.", body_style)
        ],
        [
            Paragraph("• <b>PostgreSQL 18 Real-Time Sync:</b> All student scores, round history, and word statuses persist safely with zero data loss on unexpected power cuts or browser reloads.", body_style)
        ]
    ]
    t_upg = Table(upgrades_data, colWidths=[532])
    t_upg.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f1f5f9')),
        ('BOX', (0,0), (-1,-1), 0.5, COLOR_BORDER),
        ('INNERGRID', (0,0), (-1,-1), 0.5, COLOR_BORDER),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t_upg)
    story.append(Spacer(1, 16))

    # Section 8: Formal Sign-off
    story.append(Paragraph("8. Technical Endorsement & Attestation Sign-Off", h1_style))
    sign_data = [
        [
            Paragraph("<b>Submitted by Systems Engineering Team:</b><br/><br/><br/>__________________________________<br/><b>KowaguruTech Company</b><br/>Lead Software Development Team", meta_style),
            Paragraph("<b>Received & Confirmed by Project Lead:</b><br/><br/><br/>__________________________________<br/><b>Aliyu Yahaya Masset</b><br/>Project Lead, J-YEDA Spelling Bee", meta_style),
            Paragraph("<b>Ministry of Education Attestation:</b><br/><br/><br/>__________________________________<br/><b>Official Representative</b><br/>Jigawa State Ministry of Education", meta_style)
        ]
    ]
    t_sign = Table(sign_data, colWidths=[177, 177, 178])
    t_sign.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#fafafa')),
        ('BOX', (0,0), (-1,-1), 0.5, COLOR_BORDER),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 10),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t_sign)

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Successfully generated official briefing PDF: {filename}")

if __name__ == '__main__':
    create_pdf()
