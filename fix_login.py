import os

file_path = r"d:\lap trinh\website mầm non\src\Login.js"

with open(file_path, "r", encoding="utf-8") as f:
    lines = f.readlines()

new_lines = []
i = 0
while i < len(lines):
    line = lines[i]
    
    # Fix {attSelectedClass && ( \n </div>
    if "{attSelectedClass && (" in line and i + 1 < len(lines) and "</div>" in lines[i+1] and lines[i+1].strip() == "</div>":
        new_lines.append(line)
        new_lines.append(lines[i+1].replace("</div>", "<>"))
        i += 2
        continue
        
    # Fix fragments that should be divs (I already fixed some, but let's be sure)
    # Actually, I'll just look for the specific error at 1335
    
    new_lines.append(line)
    i += 1

with open(file_path, "w", encoding="utf-8") as f:
    f.writelines(new_lines)
