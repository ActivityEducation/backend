import os

def concatenate_typescript_files(directory_path):
    """
    Concatenates all TypeScript files (.ts) in a given directory and its subdirectories.
    Each file's content is preceded by a comment indicating its path.

    Args:
        directory_path (str): The path to the directory containing TypeScript files.

    Returns:
        str: A single string containing the concatenated content.
    """
    concatenated_content = []
    
    # Ensure the directory exists
    if not os.path.isdir(directory_path):
        return f"Error: Directory '{directory_path}' not found."

    # Walk through the directory
    for root, _, files in os.walk(directory_path):
        for file_name in files:
            if file_name.endswith('.ts'):
                file_path = os.path.join(root, file_name)
                
                # Create a relative path for the comment
                relative_path = os.path.relpath(file_path, directory_path)
                # Normalize path separators for consistency (especially on Windows)
                normalized_path = relative_path.replace(os.sep, '/')
                
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    # Add file path as a TypeScript comment
                    concatenated_content.append(f"// !!-- START OF FILE --!!")
                    concatenated_content.append(f"// src/{normalized_path}\n{content}\n")
                except Exception as e:
                    # Log an error if a file cannot be read
                    concatenated_content.append(f"// Error reading {normalized_path}: {e}\n")
                    print(f"Error reading {normalized_path}: {e}")
                    
    return "\n".join(concatenated_content)

if __name__ == "__main__":
    # --- Configuration ---
    # Replace 'src' with the actual path to your TypeScript source directory.
    # If your script is in the same directory as 'src', 'src' is correct.
    # If your script is in the project root and 'src' is a subdirectory, 'src' is correct.
    # Example: If your NestJS project is at /Users/youruser/my-nestjs-app/
    # and your TypeScript files are in /Users/youruser/my-nestjs-app/src/,
    # then set ts_source_directory = 'src' (if running from my-nestjs-app/)
    # or ts_source_directory = '/Users/youruser/my-nestjs-app/src' (absolute path)
    ts_source_directory = 'src' 
    output_file_name = 'full_project_source.ts' # Name of the file to save the combined content

    print(f"Concatenating TypeScript files from: {ts_source_directory}")
    concatenated_ts_code = concatenate_typescript_files(ts_source_directory)

    if concatenated_ts_code.startswith("Error:"):
        print(concatenated_ts_code) # Print the error message
    else:
        try:
            with open(output_file_name, 'w', encoding='utf-8') as out_file:
                out_file.write(concatenated_ts_code)
            print(f"Successfully concatenated files to '{output_file_name}'.")
        except Exception as e:
            print(f"Error writing to output file '{output_file_name}': {e}")

    # Optional: Print the content to console (can be very long)
    # print("\n--- Concatenated Content ---")
    # print(concatenated_ts_code)
