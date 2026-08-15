export default class z<T = unknown> {
  default(value: T): z<T>
  natural(): z<T>
  static string(): z<string>
  static number(): z<number>
  static natural(): z<number>
  static const<T>(value: T): z<T>
  static union<T>(values: readonly z<T>[]): z<T>
  static object<T = Record<string, unknown>>(shape: Record<string, z<unknown>>): z<T>
}
