import '../utils/polyfill'
import { isExpectType } from '../utils/index'
import { name, version } from '../../package.json'
import { ConfigType, ImgType, UniImageType } from '../types/index'
import { defineReactive } from '../observer'
import Watcher, { WatchOptType } from '../observer/watcher'

export default class Lucky {
  protected readonly config: ConfigType
  protected readonly ctx: CanvasRenderingContext2D
  protected htmlFontSize: number = 16
  protected rAF: Function = function () {}
  protected boxWidth: number = 0
  protected boxHeight: number = 0

  /**
   * 公共构造器
   * @param config
   */
  constructor (config: string | HTMLDivElement | ConfigType) {
    // 先初始化 fontSize 以防后面有 rem 单位
    this.setHTMLFontSize()
    /* eslint-disable */
    // 兼容代码开始: 为了处理 v1.0.6 版本在这里传入了一个 dom
    if (typeof config === 'string') config = { el: config } as ConfigType
    else if (config.nodeType === 1) config = { el: '', divElement: config } as ConfigType
    config = config as ConfigType
    /* eslint-enable */
    this.config = config
    // 拿到 config 即可设置 dpr
    this.setDpr()
    // 初始化 window 方法
    this.initWindowFunction()
    if (!config.flag) config.flag = 'WEB'
    if (!Object.prototype.hasOwnProperty.call(config, 'ob')) config.ob = true
    if (config.el) config.divElement = document.querySelector(config.el) as HTMLDivElement
    let boxWidth = 0, boxHeight = 0
    // 如果存在父盒子, 就创建canvas标签
    if (config.divElement) {
      // 无论盒子内有没有canvas都执行覆盖逻辑
      config.canvasElement = document.createElement('canvas')
      config.divElement.appendChild(config.canvasElement)
    }
    // 初始化宽高
    this.resetWidthAndHeight()
    // 获取 canvas 上下文
    if (config.canvasElement) {
      config.ctx = config.canvasElement.getContext('2d')!
      // 添加版本信息到标签上, 方便定位版本问题
      config.canvasElement.setAttribute('package', `${name}@${version}`)
      config.canvasElement.addEventListener('click', e => this.handleClick(e))
      config.canvasElement.addEventListener('mousemove', e => this.handleMouseMove(e))
      config.canvasElement.addEventListener('mousedown', e => this.handleMouseDown(e))
      config.canvasElement.addEventListener('mouseup', e => this.handleMouseUp(e))
    }
    this.ctx = config.ctx as CanvasRenderingContext2D
    // 如果最后得不到 canvas 上下文那就无法进行绘制
    if (!config.ctx) {
      console.error('无法获取到 CanvasContext2D')
      return
    }
    if (!this.boxWidth || !this.boxHeight) {
      console.error('无法获取到宽度或高度')
      return
    }
  }

  /**
   * 初始化方法
   */
  public init (willUpdateImgs?: object) {
    this.setDpr()
    this.setHTMLFontSize()
    this.resetWidthAndHeight()
    this.zoomCanvas()
  }

  /**
   * 鼠标点击事件
   * @param e 事件参数
   */
  protected handleClick (e: MouseEvent): void {}

  /**
   * 鼠标按下事件
   * @param e 事件参数
   */
  protected handleMouseDown (e: MouseEvent): void {}

  /**
   * 鼠标抬起事件
   * @param e 事件参数
   */
  protected handleMouseUp (e: MouseEvent): void {}

  /**
   * 鼠标移动事件
   * @param e 事件参数
   */
  protected handleMouseMove (e: MouseEvent): void {}

  /**
   * 换算坐标
   */
  protected conversionAxis (x: number, y: number): [number, number] {
    return [0, 0]
  }

  /**
   * 设备像素比
   * window 环境下自动获取, 其余环境手动传入
   */
  protected setDpr (): void {
    const { config } = this
    if (config.dpr) {
      // 优先使用 config 传入的 dpr
    } else if (window) {
      (window as any).dpr = config.dpr = window.devicePixelRatio || 1
    } else if (!config.dpr) {
      console.error(config, '未传入 dpr 可能会导致绘制异常')
    }
  }

  /**
   * 根标签的字体大小
   */
  protected setHTMLFontSize (): void {
    if (!window) return
    this.htmlFontSize = +window.getComputedStyle(document.documentElement).fontSize.slice(0, -2)
  }

  /**
   * 重置盒子和canvas的宽高
   */
  private resetWidthAndHeight (): void {
    const { config } = this
    // 如果是浏览器环境并且存在盒子
    let boxWidth = 0, boxHeight = 0
    if (config.divElement) {
      boxWidth = config.divElement.offsetWidth
      boxHeight = config.divElement.offsetHeight
    }
    // 如果 config 上面没有宽高, 就从 style 上面取
    this.boxWidth = this.getLength(config.width) || boxWidth
    this.boxHeight = this.getLength(config.height) || boxHeight
    // 重新把宽高赋给盒子
    if (config.divElement) {
      config.divElement.style.overflow = 'hidden'
      config.divElement.style.width = this.boxWidth + 'px'
      config.divElement.style.height = this.boxHeight + 'px'
    }
  }

  /**
   * 从 window 对象上获取一些方法
   */
  private initWindowFunction (): void {
    const { config } = this
    if (window) {
      this.rAF = (function () {
        return window.requestAnimationFrame ||
          window.webkitRequestAnimationFrame ||
          window['mozRequestAnimationFrame'] ||
          function (callback) {
            window.setTimeout(callback, 1000 / 60)
          }
      })()
      config.setTimeout = window.setTimeout
      config.setInterval = window.setInterval
      config.clearTimeout = window.clearTimeout
      config.clearInterval = window.clearInterval
      return
    }
    if (config.rAF) {
      // 优先使用帧动画
      this.rAF = config.rAF
    } else if (config.setTimeout) {
      // 其次使用定时器
      const timeout = config.setTimeout
      this.rAF = (callback: Function): number => timeout(callback, 16.7)
    } else {
      // 如果config里面没有提供, 那就假设全局方法存在setTimeout
      this.rAF = (callback: Function): number => setTimeout(callback, 16.7)
    }
  }

  /**
   * 根据 dpr 缩放 canvas 并处理位移
   */
  protected zoomCanvas (): void {
    const { config, ctx } = this
    const { canvasElement, dpr } = config
    const [width, height] = [this.boxWidth * dpr, this.boxHeight * dpr]
    const compute = (len: number) => (len * dpr - len) / (len * dpr) * (dpr / 2) * 100
    if (!canvasElement) return
    canvasElement.width = width
    canvasElement.height = height
    canvasElement.style.width = `${width}px`
    canvasElement.style.height = `${height}px`
    canvasElement.style.transform = `scale(${1 / dpr}) translate(${-compute(width)}%, ${-compute(height)}%)`
    ctx.scale(dpr, dpr)
  }

  /**
   * 异步加载图片并返回图片的几何信息
   * @param src 图片路径
   * @param info 图片信息
   */
  protected loadImg (
    src: string,
    info: ImgType,
    resolveName = '$resolve'
  ): Promise<HTMLImageElement | UniImageType> {
    return new Promise((resolve, reject) => {
      if (!src) reject(`=> '${info.src}' 不能为空或不合法`)
      if (this.config.flag === 'WEB') {
        let imgObj = new Image()
        imgObj.src = src
        imgObj.onload = () => resolve(imgObj)
        imgObj.onerror = () => reject(`=> '${info.src}' 图片加载失败`)
      } else {
        // 其余平台向外暴露, 交给外部自行处理
        info[resolveName] = resolve
        return
      }
    })
  }

  /**
   * 公共绘制图片的方法
   * @param imgObj 图片对象
   * @param xAxis x轴位置
   * @param yAxis y轴位置
   * @param width 渲染宽度
   * @param height 渲染高度
   */
  protected drawImage (
    imgObj: HTMLImageElement | UniImageType,
    xAxis: number,
    yAxis: number,
    width: number,
    height: number
  ): void {
    let drawImg, { config, ctx } = this
    if (['WEB', 'MP-WX'].includes(config.flag)) {
      // 浏览器中直接绘制标签即可
      drawImg = imgObj
    } else if (['UNI-H5', 'UNI-MP', 'TARO-H5', 'TARO-MP'].includes(config.flag)) {
      // 小程序中直接绘制一个路径
      drawImg = (imgObj as UniImageType).path
    }
    return ctx.drawImage((drawImg as CanvasImageSource), xAxis, yAxis, width, height)
  }

  /**
   * 获取长度
   * @param length 将要转换的长度
   * @return 返回长度
   */
  protected getLength (length: string | number | undefined): number {
    if (isExpectType(length, 'number')) return length as number
    if (isExpectType(length, 'string')) return this.changeUnits(length as string)
    return 0
  }

  /**
   * 转换单位
   * @param { string } value 将要转换的值
   * @param { number } denominator 分子
   * @return { number } 返回新的字符串
   */
  protected changeUnits (value: string, denominator = 1): number {
    return Number(value.replace(/^([-]*[0-9.]*)([a-z%]*)$/, (value, num, unit) => {
      const unitFunc = {
        '%': (n: number) => n * (denominator / 100),
        'px': (n: number) => n * 1,
        'rem': (n: number) => n * this.htmlFontSize,
      }[unit]
      if (unitFunc) return unitFunc(num)
      // 如果找不到默认单位, 就交给外面处理
      const otherUnitFunc = this.config.unitFunc
      return otherUnitFunc ? otherUnitFunc(num, unit) : num
    }))
  }

  /**
   * 添加一个新的响应式数据 (临时)
   * @param data 数据
   * @param key 属性
   * @param value 新值
   */
  public $set (data: object, key: string | number, value: any) {
    if (!data || typeof data !== 'object') return
    defineReactive(data, key, value)
  }

  /**
   * 添加一个属性计算 (临时)
   * @param data 源数据
   * @param key 属性名
   * @param callback 回调函数
   */
  protected $computed (data: object, key: string, callback: Function) {
    Object.defineProperty(data, key, {
      get: () => {
        return callback.call(this)
      }
    })
  }

  /**
   * 添加一个观察者 create user watcher
   * @param expr 表达式
   * @param handler 回调函数
   * @param watchOpt 配置参数
   * @return 卸载当前观察者的函数 (暂未返回)
   */
  protected $watch (
    expr: string | Function,
    handler: Function | WatchOptType,
    watchOpt: WatchOptType = {}
  ): Function {
    if (typeof handler === 'object') {
      watchOpt = handler
      handler = watchOpt.handler!
    }
    // 创建 user watcher
    const watcher = new Watcher(this, expr, handler, watchOpt)
    // 判断是否需要初始化时触发回调
    if (watchOpt.immediate) {
      handler.call(this, watcher.value)
    }
    // 返回一个卸载当前观察者的函数
    return function unWatchFn () {}
  }
}
