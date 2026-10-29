import pypdf
import re
import json

def parse_words():
    reader = pypdf.PdfReader('Jigawa Spelling Bee JSS 500 Words 4 Rounds.pdf')
    lines = []
    for p in reader.pages:
        lines.extend(p.extract_text().splitlines())

    filtered = []
    for line in lines:
        s = line.strip()
        if not s or s.startswith('=== PAGE') or 'J-YEDA | Jigawa State' in s or re.match(r'^Page \d+$', s) or s in ['No.', 'Word', 'Part of', 'speech', 'Definition', 'Subject']:
            continue
        filtered.append(s)

    subjects = {
        'ENG': 'English Language',
        'MTH': 'Mathematics',
        'SCI': 'Basic Science',
        'DIG': 'Digital Technology',
        'BUS': 'Business Studies',
        'HIS': 'History',
        'SOC': 'Social & Civic Studies',
        'AGR': 'Agricultural Science',
        'HOM': 'Home Economics',
        'PHE': 'Physical & Health Education',
        'ART': 'Creative Arts',
        'REL': 'Religious Studies',
        'TEC': 'Basic Technology'
    }

    entries = []
    cur_round = 1
    started = False

    i = 0
    while i < len(filtered):
        item = filtered[i]
        if 'Round 1: First Round' in item:
            cur_round = 1
            started = True
            i += 1
            continue
        elif 'Round 2: Second Round' in item:
            cur_round = 2
            i += 1
            continue
        elif 'Round 3: Semi-Final Round' in item:
            cur_round = 3
            i += 1
            continue
        elif 'Round 4: Final Round' in item:
            cur_round = 4
            i += 1
            continue
        elif 'Reserve Words' in item:
            cur_round = 5
            i += 1
            continue

        if not started:
            i += 1
            continue

        if re.match(r'^\d{1,3}$', item):
            num = int(item)
            if num == len(entries) + 1:
                word = filtered[i+1].strip().upper()
                pos = filtered[i+2].strip()
                j = i + 3
                def_parts = []
                subj_code = ''
                while j < len(filtered):
                    nxt = filtered[j]
                    if nxt in subjects:
                        subj_code = nxt
                        j += 1
                        break
                    elif re.match(r'^\d{1,3}$', nxt) and int(nxt) == num + 1:
                        break
                    elif 'Round ' in nxt or 'Reserve ' in nxt:
                        break
                    else:
                        def_parts.append(nxt)
                        j += 1
                definition = ' '.join(def_parts).strip()
                subj_full = subjects.get(subj_code, subj_code or 'General')

                round_label = 'Round 1 (Simplest)' if cur_round == 1 else (
                    'Round 2' if cur_round == 2 else (
                        'Round 3 (Semi-Final)' if cur_round == 3 else (
                            'Round 4 (Final)' if cur_round == 4 else 'Reserve (Tie-Breaker)'
                        )
                    )
                )

                entries.append({
                    'num': num,
                    'round': cur_round,
                    'round_label': round_label,
                    'word': word,
                    'pos': pos.capitalize(),
                    'origin': f"{subj_code} ({subj_full})",
                    'def': definition,
                    'sentence': f"Please spell the word: {word}."
                })
                i = j
                continue
        i += 1

    with open('db/jss_500_words.json', 'w', encoding='utf-8') as f:
        json.dump(entries, f, indent=2)

    print(f"Successfully wrote db/jss_500_words.json with {len(entries)} words.")

if __name__ == '__main__':
    parse_words()
