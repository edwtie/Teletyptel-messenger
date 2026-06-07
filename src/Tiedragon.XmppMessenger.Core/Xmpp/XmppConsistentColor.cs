using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace Tiedragon.XmppMessenger.Core.Xmpp;

public static class XmppConsistentColor
{
    private const double RefU = 0.19783000664283;
    private const double RefV = 0.46831999493879;
    private const double Kappa = 903.2962962;
    private const double Epsilon = 0.0088564516;

    private static readonly double[][] RgbMatrix =
    [
        [3.240969941904521, -1.537383177570093, -0.498610760293],
        [-0.96924363628087, 1.87596750150772, 0.041555057407175],
        [0.055630079696993, -0.20397695888897, 1.056971514242878]
    ];

    public static double CreateHueAngle(string value)
    {
        ArgumentNullException.ThrowIfNull(value);
        var hash = SHA1.HashData(Encoding.UTF8.GetBytes(value));
        var hue = hash[0] + (hash[1] << 8);
        return hue / 65536.0 * 360.0;
    }

    public static XmppRgbColor CreateRgb(string value, double saturation = 100.0, double lightness = 50.0)
    {
        return HsluvToRgb(CreateHueAngle(value), saturation, lightness);
    }

    public static string CreateHex(string value, double saturation = 100.0, double lightness = 50.0)
    {
        return CreateRgb(value, saturation, lightness).ToHex();
    }

    public static XmppRgbColor HsluvToRgb(double hue, double saturation, double lightness)
    {
        hue = NormalizeHue(hue);
        saturation = Clamp(saturation, 0, 100);
        lightness = Clamp(lightness, 0, 100);
        var chroma = lightness > 99.9999999 || lightness < 0.00000001
            ? 0
            : MaxChromaForLightnessAndHue(lightness, hue) / 100.0 * saturation;
        var hueRad = hue / 360.0 * Math.Tau;
        var u = Math.Cos(hueRad) * chroma;
        var v = Math.Sin(hueRad) * chroma;
        return LuvToRgb(lightness, u, v);
    }

    private static XmppRgbColor LuvToRgb(double lightness, double u, double v)
    {
        if (lightness <= 0)
        {
            return new XmppRgbColor(0, 0, 0);
        }

        var varU = u / (13 * lightness) + RefU;
        var varV = v / (13 * lightness) + RefV;
        var y = lightness > 8
            ? Math.Pow((lightness + 16) / 116.0, 3)
            : lightness / Kappa;
        var x = -(9 * y * varU) / ((varU - 4) * varV - varU * varV);
        var z = (9 * y - 15 * varV * y - varV * x) / (3 * varV);

        var r = FromLinear(RgbMatrix[0][0] * x + RgbMatrix[0][1] * y + RgbMatrix[0][2] * z);
        var g = FromLinear(RgbMatrix[1][0] * x + RgbMatrix[1][1] * y + RgbMatrix[1][2] * z);
        var b = FromLinear(RgbMatrix[2][0] * x + RgbMatrix[2][1] * y + RgbMatrix[2][2] * z);
        return new XmppRgbColor(ToByte(r), ToByte(g), ToByte(b));
    }

    private static double MaxChromaForLightnessAndHue(double lightness, double hue)
    {
        var hueRad = hue / 360.0 * Math.Tau;
        var min = double.PositiveInfinity;
        foreach (var bound in GetBounds(lightness))
        {
            var length = LengthOfRayUntilIntersect(hueRad, bound);
            if (length >= 0)
            {
                min = Math.Min(min, length);
            }
        }

        return min;
    }

    private static IEnumerable<Line> GetBounds(double lightness)
    {
        var sub1 = Math.Pow(lightness + 16, 3) / 1560896.0;
        var sub2 = sub1 > Epsilon ? sub1 : lightness / Kappa;
        foreach (var row in RgbMatrix)
        {
            var m1 = row[0];
            var m2 = row[1];
            var m3 = row[2];
            for (var t = 0; t <= 1; t++)
            {
                var top1 = (284517 * m1 - 94839 * m3) * sub2;
                var top2 = (838422 * m3 + 769860 * m2 + 731718 * m1) * lightness * sub2 - 769860 * t * lightness;
                var bottom = (632260 * m3 - 126452 * m2) * sub2 + 126452 * t;
                yield return new Line(top1 / bottom, top2 / bottom);
            }
        }
    }

    private static double LengthOfRayUntilIntersect(double theta, Line line)
    {
        return line.Intercept / (Math.Sin(theta) - line.Slope * Math.Cos(theta));
    }

    private static double FromLinear(double value)
    {
        return value <= 0.0031308
            ? 12.92 * value
            : 1.055 * Math.Pow(value, 1 / 2.4) - 0.055;
    }

    private static int ToByte(double value)
    {
        return (int)Math.Round(Clamp(value, 0, 1) * 255, MidpointRounding.AwayFromZero);
    }

    private static double NormalizeHue(double hue)
    {
        var normalized = hue % 360.0;
        return normalized < 0 ? normalized + 360.0 : normalized;
    }

    private static double Clamp(double value, double min, double max)
    {
        return Math.Min(Math.Max(value, min), max);
    }

    private readonly record struct Line(double Slope, double Intercept);
}

public readonly record struct XmppRgbColor(int R, int G, int B)
{
    public string ToHex()
    {
        return string.Create(
            CultureInfo.InvariantCulture,
            $"#{R:X2}{G:X2}{B:X2}");
    }
}
