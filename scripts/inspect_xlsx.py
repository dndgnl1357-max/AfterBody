import sys
import openpyxl

path = sys.argv[1]
wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
print("sheets:", wb.sheetnames)
ws = wb[wb.sheetnames[0]]
for i, row in enumerate(ws.iter_rows(values_only=True)):
    print(row)
    if i > 20:
        break
