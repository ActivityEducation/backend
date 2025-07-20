import os
import re

def parse_gitignore(gitignore_path):
    """
    Parses a .gitignore file and returns a list of patterns.
    Handles comments, empty lines, and negation patterns.
    """
    patterns = []
    if os.path.exists(gitignore_path):
        with open(gitignore_path, 'r') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                
                # Handle negation patterns
                if line.startswith('!'):
                    patterns.append((line[1:], True)) # (pattern, is_negation)
                else:
                    patterns.append((line, False)) # (pattern, is_negation)
    return patterns

def matches_gitignore_pattern(filepath, patterns, root_dir):
    """
    Checks if a filepath matches any of the .gitignore patterns.
    Handles wildcards and negation.
    """
    # Always ignore the .git directory
    if ".git" in filepath.split(os.sep):
        return True

    # Normalize filepath to be relative to the root_dir
    relative_filepath = os.path.relpath(filepath, root_dir)
    
    matched_by_exclude = False
    
    for pattern_str, is_negation in patterns:
        # If pattern ends with '/', it applies to directories only
        is_dir_pattern = pattern_str.endswith('/')
        if is_dir_pattern:
            pattern_str = pattern_str[:-1] # remove trailing slash for regex matching

        # Convert gitignore pattern to regex
        regex_pattern = re.escape(pattern_str).replace(r'\*', '.*').replace(r'\?', '.')
        
        # If the pattern doesn't start with /, it can match any subdirectory
        if not pattern_str.startswith('/'):
            regex_pattern = '.*' + regex_pattern
        else:
            regex_pattern = regex_pattern[1:] # remove leading / as relpath is already relative
        
        # Ensure regex matches the whole string for consistency
        regex_pattern = '^' + regex_pattern + '$'

        if re.match(regex_pattern, relative_filepath) or \
           re.match(regex_pattern, os.path.basename(filepath)):
            if is_negation:
                matched_by_exclude = False # Negation overrides previous exclusions
            else:
                matched_by_exclude = True

    return matched_by_exclude


def generate_project_structure_doc(root_dir, output_file="project_structure.txt"):
    """
    Generates a text document representing the project structure,
    excluding files and directories based on .gitignore rules and
    explicitly ignoring the .git directory.
    """

    gitignore_path = os.path.join(root_dir, ".gitignore")
    gitignore_patterns = parse_gitignore(gitignore_path)

    with open(output_file, "w") as f:
        f.write(f"Project Structure for: {root_dir}\n")
        f.write("=" * 30 + "\n\n")

        for dirpath, dirnames, filenames in os.walk(root_dir):
            # Filter out directories that match gitignore patterns or are the .git directory
            dirnames[:] = [d for d in dirnames if not matches_gitignore_pattern(os.path.join(dirpath, d), gitignore_patterns, root_dir)]

            level = dirpath.replace(root_dir, '').count(os.sep)
            indent = ' ' * 4 * (level)

            # Don't print the root directory if it's explicitly ignored
            if dirpath != root_dir and matches_gitignore_pattern(dirpath, gitignore_patterns, root_dir):
                continue

            f.write(f"{indent}{os.path.basename(dirpath)}/\n")
            subindent = ' ' * 4 * (level + 1)
            
            for filename in filenames:
                filepath = os.path.join(dirpath, filename)
                if not matches_gitignore_pattern(filepath, gitignore_patterns, root_dir):
                    f.write(f"{subindent}{filename}\n")

if __name__ == "__main__":
    project_root = "."  # Replace with the actual root directory of your project if needed.
    generate_project_structure_doc(project_root)
    print(f"Project structure documented in project_structure.txt")