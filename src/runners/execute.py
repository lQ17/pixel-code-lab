import contextlib
import json
import traceback


def _execute(source, radius):
    class Output:
        def __init__(self):
            self.text = ''
            self.truncated = False
        def write(self, value):
            remaining = max(0, 4000 - len(self.text))
            self.text += value[:remaining]
            if len(value) > remaining:
                self.truncated = True
            return len(value)
        def flush(self):
            pass

    output = Output()
    origin = {'x': 0, 'y': 0}
    drawing = False

    def move_origin(dx, dy):
        if drawing:
            raise RuntimeError('move_origin(dx, dy) 必须在 pixel() 外、逐格计算开始前调用。')
        if type(dx) is not int or type(dy) is not int:
            raise TypeError('move_origin(dx, dy) 的参数必须为整数，不能是布尔值或小数。')
        next_x, next_y = origin['x'] + dx, origin['y'] + dy
        if abs(next_x) > 9007199254740991 or abs(next_y) > 9007199254740991:
            raise ValueError('原点偏移超出可精确显示的整数范围。')
        origin.update(x=next_x, y=next_y)

    user = {'__name__': '__main__', 'move_origin': move_origin}
    result = {}
    with contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
        try:
            exec(compile(source, 'student.py', 'exec'), user)
            function = user.get('pixel')
            if not callable(function):
                result = {'error': {'kind': 'MissingFunction', 'message': '请定义 pixel(x, y) 函数。'}}
            else:
                drawing = True
                colors = []
                for y in range(radius, -radius - 1, -1):
                    for x in range(-radius, radius + 1):
                        color = function(x - origin['x'], y - origin['y'])
                        if type(color) is not int or not 0 <= color <= 8:
                            error = {'kind': 'InvalidColor', 'message': '颜色必须为 0～8 的整数，不能是小数、布尔值或 None。请检查返回值。'}
                            function_code = getattr(function, '__code__', None)
                            if function_code is not None:
                                error['line'] = function_code.co_firstlineno
                                error['message'] += '（行号指向函数定义）'
                            result = {'error': error}
                            break
                        colors.append(color)
                    if 'error' in result:
                        break
                if 'error' not in result:
                    result = {'colors': colors, 'origin': origin}
        except BaseException as exc:
            error = {'kind': type(exc).__name__, 'message': str(exc)[:1000]}
            if isinstance(exc, SyntaxError) and exc.filename == 'student.py':
                error['line'] = exc.lineno
            else:
                frames = traceback.extract_tb(exc.__traceback__)
                lines = [frame.lineno for frame in frames if frame.filename == 'student.py']
                if lines:
                    error['line'] = lines[-1]
            result = {'error': error}
    result['logs'] = output.text + ('\n[输出已截断，最多显示 4000 字符]' if output.truncated else '')
    return json.dumps(result)

_execute(_source, _radius)
