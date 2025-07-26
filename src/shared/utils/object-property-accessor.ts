// src/shared/utils/object-property-accessor.ts

/**
 * Safely retrieves a nested property from an object using a dot-annotated string path.
 *
 * @param obj The object to traverse.
 * @param path The dot-annotated string path (e.g., 'user.actor.preferredUsername').
 * @returns The value of the nested property, or undefined if any part of the path is null or undefined.
 */
export function getNestedProperty<T = any>(obj: any, path: string): T | undefined {
  if (!obj || typeof obj !== 'object' || !path || path.trim() === '') {
    return undefined;
  }

  const pathParts = path.split('.');
  let current: any = obj;

  for (const part of pathParts) {
    if (current === null || typeof current === 'undefined') {
      return undefined; // Path broken, cannot proceed
    }
    if (typeof current !== 'object' || !current.hasOwnProperty(part)) {
      return undefined; // Part not found or current is not an object
    }
    current = current[part];
  }

  return current as T;
}

/**
 * Safely sets a nested property on an object using a dot-annotated string path.
 * If intermediate objects in the path do not exist, they will be created as plain objects.
 *
 * @param obj The object to modify.
 * @param path The dot-annotannotated string path (e.g., 'user.actor.preferredUsername').
 * @param value The value to set.
 * @returns The modified object.
 */
export function setNestedProperty(obj: any, path: string, value: any): any {
  if (!obj || typeof obj !== 'object' || !path || path.trim() === '') {
    return obj;
  }

  const pathParts = path.split('.');
  let current: any = obj;

  for (let i = 0; i < pathParts.length; i++) {
    const part = pathParts[i];
    if (i === pathParts.length - 1) {
      // Last part of the path, set the value
      current[part] = value;
    } else {
      // Not the last part, traverse or create intermediate object
      if (current === null || typeof current !== 'object') {
        // If current part is null/undefined or not an object, cannot set further
        // This case might mean we're trying to set a property on a primitive value in the path
        // For example, if obj.user is 'string' and path is 'user.actor', this would fail.
        return obj;
      }
      if (!current.hasOwnProperty(part) || typeof current[part] !== 'object' || current[part] === null) {
        current[part] = {}; // Create an empty object if the part doesn't exist or isn't an object
      }
      current = current[part];
    }
  }

  return obj;
}
