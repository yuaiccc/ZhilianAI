import zipfile
import xml.etree.ElementTree as ET
import json
import os

xlsx_path = '/Users/xujunshan/Code/ZhilianAI/AI大赛脱敏数据.xlsx'
json_path = '/Users/xujunshan/Code/ZhilianAI/data/jd_database.json'

with zipfile.ZipFile(xlsx_path, 'r') as z:
    shared_strings_xml = z.read('xl/sharedStrings.xml')
    sheet1_xml = z.read('xl/worksheets/sheet1.xml')

ns = {'ns': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
strings = [t.text for t in ET.fromstring(shared_strings_xml).findall('.//ns:t', ns)]

sheet = ET.fromstring(sheet1_xml)
data = []
headers = []

for i, row in enumerate(sheet.findall('.//ns:row', ns)):
    vals = []
    # c elements might not be sequential if cells are empty, we need to handle this
    # to be safe, let's just parse the basic ones. Wait, xml might omit empty cells.
    # We can determine the column index from the 'r' attribute like 'A1', 'B1'
    col_map = {}
    for c in row.findall('.//ns:c', ns):
        r_attr = c.get('r')
        col_letter = ''.join(filter(str.isalpha, r_attr))
        
        # calculate column index (A=0, B=1, ..., Z=25)
        col_idx = 0
        for char in col_letter:
            col_idx = col_idx * 26 + (ord(char) - ord('A') + 1)
        col_idx -= 1

        v = c.find('ns:v', ns)
        if v is not None:
            if c.get('t') == 's':
                val = strings[int(v.text)]
            else:
                val = v.text
        else:
            val = ''
        col_map[col_idx] = val

    if i == 0:
        for idx in range(max(col_map.keys()) + 1):
            headers.append(col_map.get(idx, '').strip())
    else:
        row_dict = {}
        # Only take up to column 10 (发布时间) to avoid empty columns
        for idx in range(11):
            row_dict[headers[idx]] = col_map.get(idx, '')
        # Only add valid rows
        if row_dict.get('职位名称'):
            data.append(row_dict)
            
    if len(data) >= 100:  # limit to 100 items for demo purposes
        break

os.makedirs(os.path.dirname(json_path), exist_ok=True)
with open(json_path, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f"Successfully exported {len(data)} JDs to {json_path}")
