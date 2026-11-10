import sys
import openpyxl

path = sys.argv[1]
sheet = sys.argv[2] if len(sys.argv) > 2 else None
wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
if sheet is None:
    print("sheets:", wb.sheetnames)
else:
    ws = wb[sheet]
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        print(row)
