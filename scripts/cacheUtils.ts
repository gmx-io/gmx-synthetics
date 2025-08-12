import * as fs from "fs";
import * as path from "path";

interface Cache<T> {
  version: number;
  data: Record<string, T>;
}

export class FileCache<T> {
  private readonly filePath: string;

  private cache: Cache<T> = {
    version: 0,
    data: {},
  };

  constructor(cacheFileName: string, expectedCacheVersion: number) {
    const cacheFilePath = path.join(__dirname, "../cache", cacheFileName);
    this.filePath = path.resolve(cacheFilePath);
    this.loadCache(expectedCacheVersion);
  }

  private loadCache(expectedCacheVersion: number): void {
    if (fs.existsSync(this.filePath)) {
      try {
        const data = fs.readFileSync(this.filePath, "utf-8");
        this.cache = JSON.parse(data);

        if (this.cache.version != expectedCacheVersion) {
          console.warn("Cache version mismatch, resetting cache");
          this.cache = {
            version: expectedCacheVersion,
            data: {},
          };
        }
      } catch (err) {
        console.error("Failed to load cache:", err);
        this.cache = {
          version: expectedCacheVersion,
          data: {},
        };
      }
    } else {
      this.cache.version = expectedCacheVersion;
    }
  }

  private saveCache(): void {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.cache, null, 2), "utf-8");
    } catch (err) {
      console.error("Failed to save cache:", err);
    }
  }

  public get(key: string): T | undefined {
    return this.cache.data[key];
  }

  public set(key: string, value: T): void {
    this.cache.data[key] = value;
    this.saveCache();
  }

  public delete(key: string): void {
    if (key in this.cache.data) {
      delete this.cache.data[key];
      this.saveCache();
    }
  }

  public clear(): void {
    this.cache = {
      version: 0,
      data: {},
    };
    this.saveCache();
  }

  public has(key: string): boolean {
    return key in this.cache.data;
  }

  public keys(): string[] {
    return Object.keys(this.cache.data);
  }
}
